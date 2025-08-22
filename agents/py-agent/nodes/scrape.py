from __future__ import annotations

from typing import Any, List, Dict
from datetime import datetime, timezone
import os
import asyncio
from concurrent.futures import ThreadPoolExecutor
from contextvars import copy_context

from langchain_core.runnables import RunnableConfig

from brain.state import AgentState, ResearchPlan
from brain.logger import get_logger
from copilotkit.langgraph import copilotkit_customize_config, copilotkit_emit_state
from tools.web_extract import serper_scrape
from langgraph.types import Command
from langgraph.graph import END


_THREADPOOL_WORKERS = max(1, int(os.getenv("SERPER_SCRAPE_WORKERS", "6")))
_SCRAPE_EXECUTOR = ThreadPoolExecutor(max_workers=_THREADPOOL_WORKERS)


async def _emit(config: RunnableConfig, state: AgentState, plan: ResearchPlan | dict | None = None):
    try:
        safe: dict[str, Any] = {}
        if isinstance(state, dict):
            for k, v in state.items():
                if k in ("messages", "evidence", "search_candidates"):
                    continue
                safe[k] = v
        if plan is not None:
            if hasattr(plan, "model_dump"):
                safe["plan"] = plan.model_dump()  # type: ignore[index]
            elif isinstance(plan, dict):
                safe["plan"] = plan
        await copilotkit_emit_state(config, safe)
    except Exception:
        pass


async def scrape_node(state: AgentState, config: RunnableConfig) -> dict[str, Any] | None:
    """
    For the first step with status 'reading':
    - Run Serper scrape for the selected URLs (batch/multithread via executor)
    - Append extracted evidence to state.evidence
    - Set status='completed' and emit
    """
    logger = get_logger("nodes.scrape")
    config = copilotkit_customize_config(config, emit_tool_calls=False)

    try:
        plan_raw = state.get("plan")  # type: ignore[assignment]
        plan = ResearchPlan(**plan_raw) if isinstance(plan_raw, dict) else plan_raw
    except Exception:
        plan = None
    if not plan or plan.mode != "search":
        logger.info("Scrape: no search plan; nothing to do")
        return None

    # Normalize steps to dicts to avoid Pydantic attribute access errors
    raw_steps: List[Any] = list(getattr(plan, "steps", []) or [])
    steps: List[Dict[str, Any]] = []
    from uuid import uuid4
    for s in raw_steps:
        if hasattr(s, "model_dump"):
            d = s.model_dump()  # type: ignore[attr-defined]
        elif isinstance(s, dict):
            d = dict(s)
        elif isinstance(s, str):
            d = {"id": str(uuid4()), "title": s, "queries": [s], "results": [], "status": "pending"}
        else:
            d = None
        if isinstance(d, dict):
            steps.append(d)
    logger.info("Scrape: normalized steps=%d statuses=%s", len(steps), [x.get("status") for x in steps])
    step_idx = None
    for i, s in enumerate(steps):
        if (s.get("status") or "") == "reading":
            step_idx = i
            break
    if step_idx is None:
        # Promote a 'searching' step with chosen URLs to 'reading' and proceed
        promote_idx = None
        for i, s in enumerate(steps):
            if (s.get("status") or "") == "searching":
                promote_idx = i
                break
        if promote_idx is not None:
            cand = steps[promote_idx]
            # Check for URLs using "link" first (SearchResult format), then "url" for backward compatibility
            urls_tmp = []
            for r in (cand.get("results") or []):
                if isinstance(r, dict):
                    url = r.get("link") or r.get("url")
                    if isinstance(url, str):
                        urls_tmp.append(url)
            if urls_tmp:
                cand["status"] = "reading"
                steps[promote_idx] = cand
                plan.steps = steps  # type: ignore[assignment]
                step_idx = promote_idx
            else:
                # No URLs were selected → complete step with error to break loops
                cand["error"] = {"type": "scrape_no_urls", "message": "No URLs were selected for scraping for this step."}
                cand["status"] = "completed"
                steps[promote_idx] = cand
                plan.steps = steps  # type: ignore[assignment]
                try:
                    state["plan"] = plan.model_dump()  # type: ignore[index]
                    state["current_step_id"] = None  # type: ignore[index]
                    await _emit(config, state, plan)
                except Exception:
                    pass
                return {"plan": plan.model_dump(), "current_step_id": None}
        else:
            logger.info("Scrape: no step in reading state")
            return None

    step = steps[step_idx]
    # Use only URLs selected by the picker (saved in plan step results)
    # SearchResult objects use "link" as the primary URL field
    urls = []
    for r in (step.get("results") or []):
        if isinstance(r, dict):
            # Try "link" first (SearchResult format), then "url" for backward compatibility
            url = r.get("link") or r.get("url")
            if isinstance(url, str):
                urls.append(url)
    
    print("step results:", step.get("results"))
    print("extracted urls:", urls)
    logger.info("Scrape: step_id=%s urls=%d", step.get("id"), len(urls))
    if not urls:
        step["status"] = "completed"
        steps[step_idx] = step
        plan.steps = steps  # type: ignore[assignment]
        try:
            state["plan"] = plan.model_dump()  # type: ignore[index]
            state["current_step_id"] = None  # type: ignore[index]
            await _emit(config, state, plan)
        except Exception:
            pass
        return {"plan": plan.model_dump(), "current_step_id": None}

    # Invoke serper_scrape via executor
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
    timeout_s = float(os.getenv("SERPER_EXTRACT_TIMEOUT_SECONDS", "15"))
    try:
        payload = await asyncio.wait_for(loop.run_in_executor(_SCRAPE_EXECUTOR, _call_extract), timeout=timeout_s)
    except asyncio.TimeoutError:
        payload = {"results": [], "failed_results": [{"url": None, "error": "timeout"}]}
    except Exception:
        # Strict error handling: revert step state, clear candidates for this step, and end
        try:
            step["status"] = "pending"
            steps[step_idx] = step
            plan.steps = steps  # type: ignore[assignment]
            state["plan"] = plan.model_dump()  # type: ignore[index]
            err = {"type": "scrape_error", "message": "Failed to scrape selected URLs."}
            state["error"] = err  # type: ignore[index]
            await _emit(config, state, plan)
        except Exception:
            pass
        return Command(goto=END, update={"error": {"type": "scrape_error"}})

    # Append evidence (do not overwrite)
    try:
        existing_ev: List[dict[str, Any]] = list(state.get("evidence", []))  # type: ignore[assignment]
    except Exception:
        existing_ev = []
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
            existing_ev.append(ev)
    state["evidence"] = existing_ev  # type: ignore[index]
    print("evidence", existing_ev)
    # Complete step
    step["status"] = "completed"
    steps[step_idx] = step
    plan.steps = steps  # type: ignore[assignment]
    try:
        state["plan"] = plan.model_dump()  # type: ignore[index]
        await _emit(config, state, plan)
    except Exception:
        pass

    # Clear transient candidates by returning an empty map for this step and clear current_step_id
    return {"plan": plan.model_dump(), "evidence": existing_ev, "search_candidates": {str(step.get("id")): []}, "current_step_id": None}




