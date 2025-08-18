from __future__ import annotations

from typing import Literal, Any, List, Dict
from datetime import datetime, timezone
import time
import os
import asyncio
from concurrent.futures import ThreadPoolExecutor

from langchain_core.runnables import RunnableConfig

from brain.state import AgentState, ResearchPlan
from brain.logger import get_logger
from copilotkit.langgraph import copilotkit_customize_config, copilotkit_emit_state
from tools.web_search import tavily_search

# Lightweight in-memory cache for Tavily results to improve responsiveness
# Keyed by (query,max_results); entries expire after a short TTL.
_TAVILY_CACHE: dict[str, dict[str, Any]] = {}
_TAVILY_CACHE_EXPIRY: dict[str, float] = {}

def _cache_key(query: str, max_results: int) -> str:
    return f"{query}__{max_results}"

# Dedicated thread pool for blocking Tavily client calls
_THREADPOOL_WORKERS = max(1, int(os.getenv("TAVILY_THREADPOOL_WORKERS", os.getenv("TAVILY_MAX_CONCURRENCY", "4"))))
_TAVILY_EXECUTOR = ThreadPoolExecutor(max_workers=_THREADPOOL_WORKERS)


def _favicon_for_url_from_result(item: dict[str, Any]) -> str | None:
    # Prefer Tavily's favicon if present; else derive from URL
    try:
        if isinstance(item.get("favicon"), str):
            return item["favicon"]
        url = item.get("url")
        if not isinstance(url, str):
            return None
        from urllib.parse import urlparse
        host = urlparse(url).hostname
        if not host:
            return None
        return f"https://www.google.com/s2/favicons?domain={host}&sz=64"
    except Exception:
        return None


async def _search_query_via_tool(query: str, max_results: int = 5) -> Dict[str, Any]:
    """Invoke the Tavily web search tool manually (no LLM) with basic caching."""
    try:
        # Check cache (short TTL to avoid stale data)
        ttl_seconds = float(os.getenv("TAVILY_CACHE_TTL_SECONDS", "300"))
        key = _cache_key(query, max_results)
        now = time.time()
        expiry = _TAVILY_CACHE_EXPIRY.get(key)
        if expiry is not None and expiry > now:
            cached = _TAVILY_CACHE.get(key)
            if isinstance(cached, dict):
                return dict(cached)

        # Tools are sync; run off the event loop
        def _call_tool():
            try:
                return tavily_search.invoke({"query": query, "max_results": max_results})
            except Exception:
                # Fallback to underlying function if available
                try:
                    return tavily_search.func(query=query, max_results=max_results)  # type: ignore[attr-defined]
                except Exception:
                    return {"answer": None, "results": []}

        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(_TAVILY_EXECUTOR, _call_tool)
        out = result if isinstance(result, dict) else {"answer": None, "results": []}
        # Save to cache (copy) if TTL positive
        if ttl_seconds > 0:
            _TAVILY_CACHE[key] = dict(out)
            _TAVILY_CACHE_EXPIRY[key] = now + ttl_seconds
        return out
    except Exception:
        return {"answer": None, "results": []}


async def research_node(
    state: AgentState, config: RunnableConfig
) -> dict[str, Any] | None:
    """
    Manual search executor:
    - Normalize plan steps (strings -> dict with id/title/queries/results/status)
    - Pick the first pending step, mark executing, emit
    - Run Tavily searches concurrently for up to 5 queries (max_results=5 each)
    - As each query returns, append its results (title,url,favicon) and optional answer to the step, emit
    - When all queries finish, mark completed and emit
    - Route: if another pending step exists -> research_node, else -> chat_node
    """

    logger = get_logger("nodes.research")

    # Configure CopilotKit: we stream state manually
    config = copilotkit_customize_config(config, emit_tool_calls=False)

    # Parse plan
    try:
        plan_raw = state.get("plan")  # type: ignore[assignment]
        plan = ResearchPlan(**plan_raw) if isinstance(plan_raw, dict) else plan_raw
    except Exception:
        plan = None
    if not plan or plan.mode != "search":
        logger.info("Research: no search plan; nothing to do")
        return None

    # Normalize steps into dicts with ids
    steps: List[Any] = list(getattr(plan, "steps", []) or [])
    normalized_steps: List[Dict[str, Any]] = []
    changed = False
    from uuid import uuid4
    for s in steps:
        if isinstance(s, dict) and "title" in s:
            # ensure required fields
            s.setdefault("id", str(uuid4()))
            s.setdefault("queries", [s.get("title")] if isinstance(s.get("title"), str) else [])
            s.setdefault("results", [])
            s.setdefault("status", "pending")
            normalized_steps.append(s)
        elif isinstance(s, str):
            normalized_steps.append({
                "id": str(uuid4()),
                "title": s,
                "queries": [s],  # default to title as single query
                "results": [],
                "status": "pending",
            })
            changed = True
        else:
            # unknown type; skip
            changed = True
    if changed:
        try:
            plan.steps = normalized_steps  # type: ignore[assignment]
            state["plan"] = plan.model_dump()  # type: ignore[index]
            await copilotkit_emit_state(config, state)
        except Exception:
            pass

    # Find the first pending step
    step_idx = None
    for i, s in enumerate(normalized_steps):
        if (s.get("status") or "pending") == "pending" and len(s.get("queries") or []) > 0:
            step_idx = i
            break

    if step_idx is None:
        logger.info("Research: no pending steps; nothing to do")
        return None

    step = normalized_steps[step_idx]

    # Transition to executing and emit
    step["status"] = "executing"
    normalized_steps[step_idx] = step
    plan.steps = normalized_steps  # type: ignore[assignment]
    try:
        state["plan"] = plan.model_dump()  # type: ignore[index]
        await copilotkit_emit_state(config, state)
    except Exception:
        pass

    queries: List[str] = list(step.get("queries") or [])[:5]
    if not queries:
        logger.info("Research: missing client or queries; completing step with no results")
        step["status"] = "completed"
        normalized_steps[step_idx] = step
        plan.steps = normalized_steps  # type: ignore[assignment]
        try:
            state["plan"] = plan.model_dump()  # type: ignore[index]
            await copilotkit_emit_state(config, state)
        except Exception:
            pass
        # Return updated plan only; routing handled by conditional edges
        return {"plan": plan.model_dump()}

    async def run_one(q: str) -> dict[str, Any]:
        # Enforce per-query timeout and return normalized payload including original query
        timeout_s = float(os.getenv("TAVILY_QUERY_TIMEOUT_SECONDS", "12"))
        try:
            payload = await asyncio.wait_for(_search_query_via_tool(q, max_results=5), timeout=timeout_s)
        except asyncio.TimeoutError:
            payload = {"answer": None, "results": [], "error": "timeout"}

        items = payload.get("results") if isinstance(payload, dict) else []
        out: dict[str, Any] = {"query": q, "results": []}
        try:
            for it in items:
                if not isinstance(it, dict):
                    continue
                out["results"].append({
                    "title": it.get("title"),
                    "url": it.get("url"),
                    "favicon": _favicon_for_url_from_result(it),
                    "score": it.get("score"),
                })
            ans = payload.get("answer") if isinstance(payload, dict) else None
            if isinstance(ans, str) and ans.strip():
                out["answer"] = ans.strip()
        except Exception:
            pass
        # Pass through any error code for UI
        if isinstance(payload, dict) and isinstance(payload.get("error"), str):
            out["error"] = payload["error"]
        return out

    # Execute queries with bounded concurrency; stream updates as each finishes
    max_conc = max(1, int(os.getenv("TAVILY_MAX_CONCURRENCY", "3")))
    semaphore = asyncio.Semaphore(max_conc)

    async def guarded_run(q: str) -> dict[str, Any]:
        async with semaphore:
            return await run_one(q)

    tasks: List[asyncio.Task] = [asyncio.create_task(guarded_run(q)) for q in queries]
    has_error = False
    error_codes: List[str] = []
    first_iteration = True
    for task in asyncio.as_completed(tasks):
        one = await task
        try:
            existing = step.get("results") or []
            if not isinstance(existing, list):
                existing = []
            seen = {r.get("url") for r in existing if isinstance(r, dict)}
            for r in one.get("results") or []:
                u = r.get("url")
                if not u or u in seen:
                    continue
                existing.append(r)
                seen.add(u)
            step["results"] = existing
            if isinstance(one.get("answer"), str):
                try:
                    trimmed = one["answer"].strip()
                    if len(trimmed) > 500:
                        trimmed = trimmed[:500] + "…"
                    answers_list = step.get("answers")
                    if not isinstance(answers_list, list):
                        answers_list = []
                    answers_list.append(trimmed)
                    step["answers"] = answers_list
                except Exception:
                    pass
            # Capture error codes if present
            if isinstance(one.get("error"), str):
                has_error = True
                error_codes.append(str(one["error"]))
                if first_iteration:
                    try:
                        err = {"type": "tavily_error", "message": "Web search failed to start.", "codes": error_codes[:1]}
                        state["error"] = err  # type: ignore[index]
                        await copilotkit_emit_state(config, state)
                    except Exception:
                        pass
                    return {"plan": plan.model_dump(), "error": err}
            normalized_steps[step_idx] = step
            plan.steps = normalized_steps  # type: ignore[assignment]
            state["plan"] = plan.model_dump()  # type: ignore[index]
            await copilotkit_emit_state(config, state)
        except Exception:
            pass
        first_iteration = False

    # Mark completed and emit; set top-level error for UI if any
    step["status"] = "completed"
    if has_error:
        # Attach a compact error summary for the UI
        step["error"] = {
            "type": "tavily_error",
            "codes": error_codes[:3],
        }
        try:
            state["error"] = {  # type: ignore[index]
                "type": "tavily_error",
                "message": "Some searches failed. Results may be incomplete.",
                "codes": error_codes[:3],
            }
        except Exception:
            pass
    normalized_steps[step_idx] = step
    plan.steps = normalized_steps  # type: ignore[assignment]
    try:
        state["plan"] = plan.model_dump()  # type: ignore[index]
        await copilotkit_emit_state(config, state)
    except Exception:
        pass

    # Return updated plan; routing decided via conditional edges in the graph
    return {"plan": plan.model_dump()}


