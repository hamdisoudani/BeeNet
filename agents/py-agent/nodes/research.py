from __future__ import annotations

from typing import Literal, Any, List, Dict
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
from tools.web_extract import serper_scrape
from brain.model import get_planner_model

# Lightweight in-memory cache for Serper results to improve responsiveness
# Keyed by (query,max_results); entries expire after a short TTL.
_SERPER_CACHE: dict[str, dict[str, Any]] = {}
_SERPER_CACHE_EXPIRY: dict[str, float] = {}

def _cache_key(query: str, max_results: int) -> str:
    return f"{query}__{max_results}"

# Dedicated thread pool for blocking HTTP client calls
_THREADPOOL_WORKERS = max(1, int(os.getenv("SERPER_THREADPOOL_WORKERS", os.getenv("SERPER_MAX_CONCURRENCY", "4"))))
_SERPER_EXECUTOR = ThreadPoolExecutor(max_workers=_THREADPOOL_WORKERS)


async def _sanitize_and_emit_state(config: RunnableConfig, state: AgentState, plan_obj: ResearchPlan | dict | None = None):
    """Emit a safe snapshot of state without messages or raw evidence.

    We avoid leaking heavy or sensitive fields (e.g., evidence markdown) to the UI.
    """
    try:
        safe: dict[str, Any] = {}
        if isinstance(state, dict):
            for k, v in state.items():  # type: ignore[attr-defined]
                if k in ("messages", "evidence", "search_candidates"):
                    continue
                safe[k] = v
        # Ensure the latest plan is present
        if plan_obj is not None:
            if hasattr(plan_obj, "model_dump"):
                safe["plan"] = plan_obj.model_dump()  # type: ignore[index]
            elif isinstance(plan_obj, dict):
                safe["plan"] = plan_obj
        await copilotkit_emit_state(config, safe)
    except Exception:
        pass


def _favicon_for_url_from_result(item: dict[str, Any]) -> str | None:
    # Prefer Serper's favicon if present; else derive from URL
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
    """Invoke the Serper web search tool manually (no LLM) with basic caching."""
    try:
        # Check cache (short TTL to avoid stale data)
        ttl_seconds = float(os.getenv("SERPER_CACHE_TTL_SECONDS", "300"))
        key = _cache_key(query, max_results)
        now = time.time()
        expiry = _SERPER_CACHE_EXPIRY.get(key)
        if expiry is not None and expiry > now:
            cached = _SERPER_CACHE.get(key)
            if isinstance(cached, dict):
                return dict(cached)

        # Tools are sync; run off the event loop
        ctx = copy_context()
        def _call_tool():
            try:
                payload: Dict[str, Any] = {"query": query, "num": max_results}
                return ctx.run(lambda: serper_search.invoke(payload))
            except Exception:
                # Fallback to underlying function if available
                try:
                    return ctx.run(lambda: serper_search.func(query=query, num=max_results))  # type: ignore[attr-defined]
                except Exception:
                    return {"results": []}

        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(_SERPER_EXECUTOR, _call_tool)
        out = result if isinstance(result, dict) else {"results": []}
        # Save to cache (copy) if TTL positive
        if ttl_seconds > 0:
            _SERPER_CACHE[key] = dict(out)
            _SERPER_CACHE_EXPIRY[key] = now + ttl_seconds
        return out
    except Exception:
        return {"results": []}


async def research_node(
    state: AgentState, config: RunnableConfig
) -> dict[str, Any] | None:
    """
    Manual search executor:
    - Normalize plan steps (strings -> dict with id/title/queries/results/status)
    - Pick the first pending step, mark executing, emit
    - Run Serper searches concurrently for up to 5 queries (num=5 each)
    - As each query returns, append its results (title,url,favicon) and optional answer to the step, emit
    - When all queries finish, mark completed and emit
    - Route: if another pending step exists -> research_node, else -> chat_node
    """

    logger = get_logger("nodes.research")

    # Configure CopilotKit: we stream state manually
    config = copilotkit_customize_config(config, emit_tool_calls=False)

    # Prepare an accumulator for evidence across this node execution
    try:
        evidence_accum: List[dict[str, Any]] = list(state.get("evidence", []))  # type: ignore[assignment]
    except Exception:
        evidence_accum = []

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
            await _sanitize_and_emit_state(config, state, plan)
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

    # Transition to searching and emit
    step["status"] = "searching"
    normalized_steps[step_idx] = step
    plan.steps = normalized_steps  # type: ignore[assignment]
    try:
        state["plan"] = plan.model_dump()  # type: ignore[index]
        await _sanitize_and_emit_state(config, state, plan)
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
            await _sanitize_and_emit_state(config, state, plan)
        except Exception:
            pass
        # Return updated plan only; routing handled by conditional edges
        return {"plan": plan.model_dump()}

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
        # Enforce per-query timeout and return normalized payload including original query
        timeout_s = float(os.getenv("SERPER_QUERY_TIMEOUT_SECONDS", "12"))
        try:
            # Map per-step controls to Serper params and prefer direct tool invocation to pass them
            step_ctrl = (step.get("controls") if isinstance(step, dict) else None) or {}
            gl = step_ctrl.get("country") or "us"
            autocorrect = bool(step_ctrl.get("autocorrect", True))
            mr = step_ctrl.get("max_results")
            max_num = int(mr) if isinstance(mr, (int, float)) else 5
            tbs = _tbs_from_time_range(step_ctrl.get("time_range"))
            from contextvars import copy_context
            ctx = copy_context()
            def _call_tool():
                try:
                    return ctx.run(lambda: serper_search.invoke({
                        "query": q, "num": max_num, "gl": gl, "hl": "en", "autocorrect": autocorrect, "tbs": tbs
                    }))
                except Exception:
                    return ctx.run(lambda: serper_search.func(query=q, num=max_num, gl=gl, hl="en", autocorrect=autocorrect, tbs=tbs))  # type: ignore[attr-defined]
            loop = asyncio.get_running_loop()
            payload = await asyncio.wait_for(loop.run_in_executor(_SERPER_EXECUTOR, _call_tool), timeout=timeout_s)
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
            # We no longer rely on provider short answers in plan steps
        except Exception:
            pass
        # Pass through any error code for UI
        if isinstance(payload, dict) and isinstance(payload.get("error"), str):
            out["error"] = payload["error"]
        return out

    # Execute queries with bounded concurrency; stream updates as each finishes
    max_conc = max(1, int(os.getenv("SERPER_MAX_CONCURRENCY", "3")))
    semaphore = asyncio.Semaphore(max_conc)

    async def guarded_run(q: str) -> dict[str, Any]:
        async with semaphore:
            return await run_one(q)

    tasks: List[asyncio.Task] = [asyncio.create_task(guarded_run(q)) for q in queries]
    has_error = False
    error_codes: List[str] = []
    aggregated_results: List[dict[str, Any]] = []
    for task in asyncio.as_completed(tasks):
        try:
            one = await task
        except Exception:
            one = {"results": [], "error": "task_failed"}
        try:
            # Capture error codes if present
            if isinstance(one.get("error"), str):
                has_error = True
                error_codes.append(str(one["error"]))
            # Aggregate results for selection
            for r in one.get("results") or []:
                if isinstance(r, dict):
                    aggregated_results.append(r)
        except Exception:
            pass

    # After all queries finish: select top results by score with domain diversity and text-only filter
    def _is_texty_url(u: str) -> bool:
        try:
            url = u.lower()
            from urllib.parse import urlparse
            host = urlparse(url).hostname or ""
            if any(d in host for d in ("youtube.com", "youtu.be")):
                return False
            banned_ext = (".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg")
            if any(url.endswith(ext) for ext in banned_ext):
                return False
            return True
        except Exception:
            return True

    # Deduplicate by canonical URL
    seen_urls: set[str] = set()
    deduped: List[dict[str, Any]] = []
    for r in aggregated_results:
        u = r.get("url") if isinstance(r, dict) else None
        if not isinstance(u, str) or not _is_texty_url(u):
            continue
        if u in seen_urls:
            continue
        seen_urls.add(u)
        deduped.append(r)

    # LLM-guided selection of URLs to crawl based on the plan step goal
    async def _choose_urls_with_llm(step_obj: dict[str, Any], candidates: List[dict[str, Any]]) -> List[str]:
        try:
            model = get_planner_model(config)
            queries = step_obj.get("queries") or []
            title = step_obj.get("title") or ""
            # Truncate candidate list for prompt safety (positions already reflect importance)
            cand = []
            for it in candidates[:10]:
                if isinstance(it, dict) and isinstance(it.get("url"), str):
                    cand.append({
                        "title": it.get("title"),
                        "url": it.get("url"),
                        "snippet": it.get("snippet") or it.get("description") or "",
                        "position": it.get("position"),
                    })
            sys = (
                "You are selecting the minimal set of URLs to crawl to answer the user's research step. "
                "Prefer authoritative, content-rich sources; avoid social posts, login walls, and duplicate domains unless necessary. "
                "Return STRICT JSON with a 'urls' array of at most N items (no markdown)."
            )
            max_crawl = max(1, int(os.getenv("SERPER_MAX_CRAWL_PER_STEP", "3")))
            prompt = (
                f"Step goal: {title}\n"
                f"Queries: {queries}\n"
                f"Max URLs to crawl: {max_crawl}\n"
                f"Candidates (JSON): {cand}\n"
                "Respond as: {\"urls\":[\"https://example.com\",...]}"
            )
            msg = [
                ("system", sys),
                ("user", prompt),
            ]
            # LangChain ChatOpenAI expects messages as dicts
            messages = [
                {"role": r, "content": c} for (r, c) in msg
            ]
            resp = await model.ainvoke(messages)  # type: ignore[attr-defined]
            txt = getattr(resp, "content", None)
            import json
            data = json.loads(txt) if isinstance(txt, str) else {}
            out = data.get("urls") if isinstance(data, dict) else None
            urls: List[str] = [u for u in out if isinstance(u, str)] if isinstance(out, list) else []
            # Filter to known candidates and enforce domain diversity
            from urllib.parse import urlparse
            max_per_domain = max(1, int(os.getenv("SERPER_MAX_PER_DOMAIN", "1")))
            seen_hosts: dict[str, int] = {}
            final: List[str] = []
            cand_set = {str(x.get("url")) for x in candidates if isinstance(x.get("url"), str)}
            for u in urls:
                if u not in cand_set:
                    continue
                try:
                    host = urlparse(u).hostname or ""
                except Exception:
                    host = ""
                if seen_hosts.get(host, 0) >= max_per_domain:
                    continue
                seen_hosts[host] = seen_hosts.get(host, 0) + 1
                final.append(u)
                if len(final) >= max_crawl:
                    break
            return final
        except Exception:
            return []

    chosen_urls = await _choose_urls_with_llm(step, deduped)
    if not chosen_urls:
        # Fallback: preserve provider order with simple domain diversity
        topk = max(1, int(os.getenv("SERPER_TOPK_SELECTION", "2")))
        max_per_domain = max(1, int(os.getenv("SERPER_MAX_PER_DOMAIN", "1")))
        selected_tmp: List[str] = []
        from urllib.parse import urlparse
        per_domain_count: dict[str, int] = {}
        for r in deduped:
            if len(selected_tmp) >= topk:
                break
            try:
                host = urlparse(r.get("url", "")).hostname or ""
            except Exception:
                host = ""
            if per_domain_count.get(host, 0) >= max_per_domain:
                continue
            per_domain_count[host] = per_domain_count.get(host, 0) + 1
            selected_tmp.append(str(r.get("url")))
        chosen_urls = selected_tmp

    # Filter step results to chosen URLs only (preserve order)
    selected: List[dict[str, Any]] = [r for r in deduped if str(r.get("url")) in chosen_urls]

    # Update step results with selected only; move to reading phase
    step["results"] = selected
    step["status"] = "reading"
    normalized_steps[step_idx] = step
    plan.steps = normalized_steps  # type: ignore[assignment]
    try:
        state["plan"] = plan.model_dump()  # type: ignore[index]
        await _sanitize_and_emit_state(config, state, plan)
    except Exception:
        pass

    # Phase 2: Extract selected URLs via tool (batch); store ONLY in state.evidence (not emitted)
    step_errors: List[str] = []
    try:
        timeout_s = float(os.getenv("SERPER_EXTRACT_TIMEOUT_SECONDS", "10"))
        urls = [r.get("url") for r in selected if isinstance(r, dict) and isinstance(r.get("url"), str)]
        ctx = copy_context()
        def _call_extract():
            try:
                return ctx.run(lambda: serper_scrape.invoke({"urls": urls}))
            except Exception:
                try:
                    return ctx.run(lambda: serper_scrape.func(urls=urls))  # type: ignore[attr-defined]
                except Exception:
                    return {"results": [], "failed_results": [{"url": None, "error": "extract_failed"}]}

        loop = asyncio.get_running_loop()
        payload = await asyncio.wait_for(loop.run_in_executor(_SERPER_EXECUTOR, _call_extract), timeout=timeout_s)
        res_list = payload.get("results") if isinstance(payload, dict) else []
        for item in res_list or []:
            if not isinstance(item, dict):
                continue
            url = item.get("url")
            rc = item.get("raw_content")
            if isinstance(url, str) and isinstance(rc, str) and rc.strip():
                ev = {
                    "stepId": step.get("id"),
                    "url": url,
                    "markdown": rc,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
                evidence_accum.append(ev)
                state["evidence"] = evidence_accum  # type: ignore[index]
        failed = payload.get("failed_results") if isinstance(payload, dict) else []
        for fr in failed or []:
            if isinstance(fr, dict):
                step_errors.append(str(fr.get("error") or "extract_failed"))
        await _sanitize_and_emit_state(config, state, plan)
    except Exception:
        step_errors.append("extract_error")

    # Phase 3: Completed
    step["status"] = "completed"
    if has_error:
        step["error"] = {
            "type": "serper_error",
            "codes": error_codes[:3],
            "message": "Search encountered errors for this step.",
        }
    if step_errors:
        step["crawlErrors"] = step_errors[:3]
    normalized_steps[step_idx] = step
    plan.steps = normalized_steps  # type: ignore[assignment]
    try:
        state["plan"] = plan.model_dump()  # type: ignore[index]
        await _sanitize_and_emit_state(config, state, plan)
    except Exception:
        pass

    # Return updated plan and evidence; routing decided via conditional edges in the graph
    return {"plan": plan.model_dump(), "evidence": evidence_accum}


