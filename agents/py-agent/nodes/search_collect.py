from __future__ import annotations

from typing import Any, List, Dict
from datetime import datetime, timezone
import time
import os
import asyncio
from concurrent.futures import ThreadPoolExecutor
from contextvars import copy_context

from langchain_core.runnables import RunnableConfig

from brain.state import AgentState, ResearchPlan
from brain.logger import get_logger
from copilotkit.langgraph import copilotkit_customize_config, copilotkit_emit_state
from tools.web_search import serper_search


# Lightweight in-memory cache for Serper results to improve responsiveness
_SERPER_CACHE: dict[str, dict[str, Any]] = {}
_SERPER_CACHE_EXPIRY: dict[str, float] = {}


def _cache_key(query: str, max_results: int) -> str:
    return f"{query}__{max_results}"


_THREADPOOL_WORKERS = max(1, int(os.getenv("SERPER_THREADPOOL_WORKERS", os.getenv("SERPER_MAX_CONCURRENCY", "4"))))
_SERPER_EXECUTOR = ThreadPoolExecutor(max_workers=_THREADPOOL_WORKERS)


async def _sanitize_and_emit_state(config: RunnableConfig, state: AgentState, plan_obj: ResearchPlan | dict | None = None):
    try:
        safe: dict[str, Any] = {}
        if isinstance(state, dict):
            for k, v in state.items():  # type: ignore[attr-defined]
                if k in ("messages", "evidence"):
                    continue
                safe[k] = v
        if plan_obj is not None:
            if hasattr(plan_obj, "model_dump"):
                safe["plan"] = plan_obj.model_dump()  # type: ignore[index]
            elif isinstance(plan_obj, dict):
                safe["plan"] = plan_obj
        await copilotkit_emit_state(config, safe)
    except Exception:
        pass


def _favicon_for_url(url: str) -> str | None:
    try:
        from urllib.parse import urlparse
        host = urlparse(url).hostname
        if not host:
            return None
        return f"https://www.google.com/s2/favicons?domain={host}&sz=64"
    except Exception:
        return None


async def _search_query_via_tool(query: str, max_results: int = 5) -> Dict[str, Any]:
    try:
        ttl_seconds = float(os.getenv("SERPER_CACHE_TTL_SECONDS", "300"))
        key = _cache_key(query, max_results)
        now = time.time()
        expiry = _SERPER_CACHE_EXPIRY.get(key)
        if expiry is not None and expiry > now:
            cached = _SERPER_CACHE.get(key)
            if isinstance(cached, dict):
                return dict(cached)

        ctx = copy_context()
        def _call_tool():
            try:
                payload: Dict[str, Any] = {"query": query, "num": max_results}
                return ctx.run(lambda: serper_search.invoke(payload))
            except Exception:
                try:
                    return ctx.run(lambda: serper_search.func(query=query, num=max_results))  # type: ignore[attr-defined]
                except Exception:
                    return {"results": []}

        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(_SERPER_EXECUTOR, _call_tool)
        out = result if isinstance(result, dict) else {"results": []}
        if ttl_seconds > 0:
            _SERPER_CACHE[key] = dict(out)
            _SERPER_CACHE_EXPIRY[key] = now + ttl_seconds
        return out
    except Exception:
        return {"results": []}


async def search_collect_node(state: AgentState, config: RunnableConfig) -> dict[str, Any] | None:
    """
    For the first pending step in the research plan:
    - Execute Serper searches for that step's queries
    - Aggregate and deduplicate results (preserve provider order)
    - Update step.results with the aggregated list
    - Keep status as 'searching' to be picked by the next node
    - Emit a sanitized state snapshot
    """
    logger = get_logger("nodes.search_collect")
    config = copilotkit_customize_config(config, emit_tool_calls=False)

    # Parse plan
    try:
        plan_raw = state.get("plan")  # type: ignore[assignment]
        plan = ResearchPlan(**plan_raw) if isinstance(plan_raw, dict) else plan_raw
    except Exception:
        plan = None
    if not plan or plan.mode != "search":
        logger.info("SearchCollect: no search plan; nothing to do")
        return None

    # Normalize steps and find first pending
    try:
        steps: List[Any] = list(getattr(plan, "steps", []) or [])
    except Exception:
        steps = []
    normalized_steps: List[Dict[str, Any]] = []
    from uuid import uuid4
    changed = False
    for s in steps:
        if isinstance(s, dict) and "title" in s:
            s.setdefault("id", str(uuid4()))
            s.setdefault("queries", [s.get("title")] if isinstance(s.get("title"), str) else [])
            s.setdefault("results", [])
            s.setdefault("status", "pending")
            normalized_steps.append(s)
        elif isinstance(s, str):
            normalized_steps.append({"id": str(uuid4()), "title": s, "queries": [s], "results": [], "status": "pending"})
            changed = True
        else:
            changed = True
    if changed:
        try:
            plan.steps = normalized_steps  # type: ignore[assignment]
            state["plan"] = plan.model_dump()  # type: ignore[index]
            await _sanitize_and_emit_state(config, state, plan)
        except Exception:
            pass

    step_idx = None
    for i, s in enumerate(normalized_steps):
        if (s.get("status") or "pending") == "pending" and len(s.get("queries") or []) > 0:
            step_idx = i
            break
    if step_idx is None:
        logger.info("SearchCollect: no pending steps")
        return None

    step = normalized_steps[step_idx]
    step["status"] = "searching"
    normalized_steps[step_idx] = step
    plan.steps = normalized_steps  # type: ignore[assignment]
    try:
        state["plan"] = plan.model_dump()  # type: ignore[index]
        await _sanitize_and_emit_state(config, state, plan)
    except Exception:
        pass

    # Run Serper for each query (bounded concurrency)
    queries: List[str] = list(step.get("queries") or [])[:5]
    if not queries:
        return {"plan": plan.model_dump()}

    async def run_one(q: str) -> dict[str, Any]:
        timeout_s = float(os.getenv("SERPER_QUERY_TIMEOUT_SECONDS", "12"))
        try:
            payload = await asyncio.wait_for(_search_query_via_tool(q, max_results=10), timeout=timeout_s)
        except asyncio.TimeoutError:
            payload = {"results": [], "error": "timeout"}
        items = payload.get("results") if isinstance(payload, dict) else []
        out: dict[str, Any] = {"query": q, "results": []}
        try:
            for it in items:
                if not isinstance(it, dict):
                    continue
                url = it.get("url")
                if isinstance(url, str):
                    out["results"].append({
                        "title": it.get("title"),
                        "url": url,
                        "favicon": _favicon_for_url(url),
                        "position": it.get("position"),
                        "snippet": it.get("snippet"),
                    })
        except Exception:
            pass
        if isinstance(payload, dict) and isinstance(payload.get("error"), str):
            out["error"] = payload["error"]
        return out

    max_conc = max(1, int(os.getenv("SERPER_MAX_CONCURRENCY", "3")))
    semaphore = asyncio.Semaphore(max_conc)
    async def guarded_run(q: str) -> dict[str, Any]:
        async with semaphore:
            return await run_one(q)

    tasks: List[asyncio.Task] = [asyncio.create_task(guarded_run(q)) for q in queries]
    aggregated_results: List[dict[str, Any]] = []
    for task in asyncio.as_completed(tasks):
        try:
            one = await task
        except Exception:
            one = {"results": []}
        try:
            for r in one.get("results") or []:
                if isinstance(r, dict):
                    aggregated_results.append(r)
        except Exception:
            pass

    # Deduplicate by URL, preserve order
    seen_urls: set[str] = set()
    deduped: List[dict[str, Any]] = []
    for r in aggregated_results:
        u = r.get("url") if isinstance(r, dict) else None
        if not isinstance(u, str):
            continue
        if u in seen_urls:
            continue
        seen_urls.add(u)
        deduped.append(r)

    # Update step results only (selection happens in the next node)
    step["results"] = deduped
    normalized_steps[step_idx] = step
    plan.steps = normalized_steps  # type: ignore[assignment]
    try:
        state["plan"] = plan.model_dump()  # type: ignore[index]
        await _sanitize_and_emit_state(config, state, plan)
    except Exception:
        pass

    return {"plan": plan.model_dump()}


