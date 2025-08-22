from __future__ import annotations

from typing import Any, List, Dict
from datetime import datetime, timezone
import time
import os
import asyncio
from concurrent.futures import ThreadPoolExecutor
from contextvars import copy_context

from langchain_core.runnables import RunnableConfig

from brain.state import AgentState, SearchResult
from brain.logger import get_logger
from copilotkit.langgraph import copilotkit_customize_config, copilotkit_emit_state
from tools.web_search import serper_search
from langgraph.types import Command
from langgraph.graph import END


# Lightweight in-memory cache for Serper results to improve responsiveness
_SERPER_CACHE: dict[str, dict[str, Any]] = {}
_SERPER_CACHE_EXPIRY: dict[str, float] = {}


def _cache_key(query: str, max_results: int) -> str:
    return f"{query}__{max_results}"


_THREADPOOL_WORKERS = max(1, int(os.getenv("SERPER_THREADPOOL_WORKERS", os.getenv("SERPER_MAX_CONCURRENCY", "4"))))
_SERPER_EXECUTOR = ThreadPoolExecutor(max_workers=_THREADPOOL_WORKERS)


async def _sanitize_and_emit_state(config: RunnableConfig, state: AgentState, plan_obj: dict | None = None):
    try:
        safe: dict[str, Any] = {}
        if isinstance(state, dict):
            for k, v in state.items():  # type: ignore[attr-defined]
                if k in ("messages", "evidence", "search_candidates", "current_step_id"):
                    continue
                safe[k] = v
        if plan_obj is not None:
            if isinstance(plan_obj, dict):
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

    # Parse plan as dict
    try:
        plan = state.get("plan")  # type: ignore[assignment]
    except Exception:
        plan = None
    if not isinstance(plan, dict) or (plan.get("mode") or "") != "search":
        logger.info("SearchCollect: no search plan; nothing to do")
        return None

    # Normalize steps and find first pending
    try:
        steps: List[Any] = list((plan.get("steps") if isinstance(plan, dict) else []) or [])
    except Exception:
        steps = []
    normalized_steps: List[Dict[str, Any]] = []
    from uuid import uuid4
    changed = False
    logger.info("SearchCollect: raw steps count=%d", len(steps))
    for s in steps:
        if hasattr(s, "model_dump"):
            d = s.model_dump()  # type: ignore[attr-defined]
        elif isinstance(s, dict):
            d = dict(s)
        elif isinstance(s, str):
            d = {"id": str(uuid4()), "title": s, "queries": [s], "results": [], "status": "pending"}
        else:
            d = None
        if isinstance(d, dict) and "title" in d:
            d.setdefault("id", str(uuid4()))
            d.setdefault("queries", [d.get("title")] if isinstance(d.get("title"), str) else [])
            d.setdefault("results", [])
            d.setdefault("status", "pending")
            normalized_steps.append(d)
            # mark changed if original was not a dict PlanStep
            if not isinstance(s, dict):
                changed = True
        else:
            changed = True
    if changed:
        try:
            plan["steps"] = normalized_steps
            state["plan"] = plan  # type: ignore[index]
            await _sanitize_and_emit_state(config, state, plan)
        except Exception:
            pass

    step_idx = None
    for i, s in enumerate(normalized_steps):
        if (s.get("status") or "pending") == "pending" and len(s.get("queries") or []) > 0:
            step_idx = i
            break
    if step_idx is None:
        logger.info("SearchCollect: no pending steps. statuses=%s", [ns.get("status") for ns in normalized_steps])
        return None

    step = normalized_steps[step_idx]
    step["status"] = "searching"
    normalized_steps[step_idx] = step
    try:
        # Set current active step id for downstream nodes
        state["current_step_id"] = str(step.get("id"))  # type: ignore[index]
        plan["steps"] = normalized_steps
        state["plan"] = plan  # type: ignore[index]
        await _sanitize_and_emit_state(config, state, plan)
    except Exception:
        pass

    # Run Serper for each query (bounded concurrency)
    queries: List[str] = list(step.get("queries") or [])[:5]
    if not queries:
        return {"plan": plan}

    def _tbs_from_time_range(val: str | None) -> str | None:
        if not isinstance(val, str):
            return None
        m = {
            "day": "qdr:d",
            "week": "qdr:w",
            "month": "qdr:m",
            "year": "qdr:y",
        }.get(val)
        return m

    async def run_one(q: str) -> dict[str, Any]:
        timeout_s = float(os.getenv("SERPER_QUERY_TIMEOUT_SECONDS", "12"))
        try:
            # Map per-step controls to Serper params and call tool directly once
            step_ctrl = (step.get("controls") if isinstance(step, dict) else None) or {}
            gl = step_ctrl.get("country") or "us"
            autocorrect = bool(step_ctrl.get("autocorrect", True))
            mr = step_ctrl.get("max_results")
            max_num = int(mr) if isinstance(mr, (int, float)) else 10
            tbs = _tbs_from_time_range(step_ctrl.get("time_range"))
            from tools.web_search import serper_search
            from contextvars import copy_context
            ctx = copy_context()
            def _call_direct():
                return ctx.run(lambda: serper_search.invoke({
                    "query": q, "num": max_num, "gl": gl, "hl": "en", "autocorrect": autocorrect, "tbs": tbs
                }))
            loop = asyncio.get_running_loop()
            payload = await asyncio.wait_for(loop.run_in_executor(_SERPER_EXECUTOR, _call_direct), timeout=timeout_s)
        except asyncio.TimeoutError:
            payload = {"results": [], "error": "timeout"}
        
        # Parse Serper response - organic results are in payload.get("organic")
        organic_results = payload.get("organic", []) if isinstance(payload, dict) else []
        search_results: List[SearchResult] = []
        
        try:
            for item in organic_results:
                if not isinstance(item, dict):
                    continue
                link = item.get("link")
                if not isinstance(link, str):
                    continue
                
                # Create SearchResult object matching Serper structure
                try:
                    search_result = SearchResult(
                        title=item.get("title"),
                        link=link,
                        snippet=item.get("snippet"),
                        position=item.get("position"),
                        favicon=_favicon_for_url(link)
                    )
                    search_results.append(search_result)
                except Exception:
                    # Skip invalid results
                    continue
        except Exception:
            pass
        
        out: dict[str, Any] = {"query": q, "results": search_results}
        if isinstance(payload, dict) and isinstance(payload.get("error"), str):
            out["error"] = payload["error"]
        return out

    max_conc = max(1, int(os.getenv("SERPER_MAX_CONCURRENCY", "3")))
    semaphore = asyncio.Semaphore(max_conc)
    async def guarded_run(q: str) -> dict[str, Any]:
        async with semaphore:
            return await run_one(q)

    try:
        tasks: List[asyncio.Task] = [asyncio.create_task(guarded_run(q)) for q in queries]
        aggregated_results: List[SearchResult] = []
        for task in asyncio.as_completed(tasks):
            try:
                one = await task
            except Exception:
                one = {"results": []}
            try:
                # Results are now SearchResult objects
                for r in one.get("results") or []:
                    if isinstance(r, SearchResult):
                        aggregated_results.append(r)
            except Exception:
                pass

        # Deduplicate by link/URL, preserve order
        seen_urls: set[str] = set()
        deduped: List[SearchResult] = []
        for r in aggregated_results:
            url = r.link
            if url in seen_urls:
                continue
            seen_urls.add(url)
            deduped.append(r)

        # Store search_candidates as {step_id: List[SearchResult]} structure
        try:
            step_id = str(step.get("id"))
            existing_map = state.get("search_candidates", {}) if isinstance(state, dict) else {}
            base_map = dict(existing_map) if isinstance(existing_map, dict) else {}
            # Store as list of SearchResult objects (they'll be serialized when emitted)
            base_map[step_id] = deduped
        except Exception:
            base_map = {str(step.get("id")): deduped}
        try:
            plan["steps"] = normalized_steps
            state["plan"] = plan  # type: ignore[index]
            await _sanitize_and_emit_state(config, state, plan)
        except Exception:
            pass
        logger.info("search_collect_node: collected %d results for step %s", len(deduped), step_id)
        return {"plan": plan, "search_candidates": base_map, "current_step_id": str(step.get("id"))}
    except Exception:
        # Strict error handling: revert step state, clear candidates, emit error, and end
        try:
            step["status"] = "pending"
            normalized_steps[step_idx] = step
            plan["steps"] = normalized_steps
            state["plan"] = plan  # type: ignore[index]
            err = {"type": "search_collect_error", "message": "Failed to collect search results."}
            state["error"] = err  # type: ignore[index]
            await _sanitize_and_emit_state(config, state, plan)
        except Exception:
            pass
        return Command(goto=END, update={"error": {"type": "search_collect_error"}})




