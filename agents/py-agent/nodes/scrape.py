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


_THREADPOOL_WORKERS = max(1, int(os.getenv("SERPER_SCRAPE_WORKERS", "6")))
_SCRAPE_EXECUTOR = ThreadPoolExecutor(max_workers=_THREADPOOL_WORKERS)


async def _emit(config: RunnableConfig, state: AgentState, plan: ResearchPlan | dict | None = None):
    try:
        safe: dict[str, Any] = {}
        if isinstance(state, dict):
            for k, v in state.items():
                if k in ("messages", "evidence"):
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

    steps: List[Dict[str, Any]] = list(getattr(plan, "steps", []) or [])
    step_idx = None
    for i, s in enumerate(steps):
        if (s.get("status") or "") == "reading":
            step_idx = i
            break
    if step_idx is None:
        logger.info("Scrape: no step in reading state")
        return None

    step = steps[step_idx]
    urls = [r.get("url") for r in (step.get("results") or []) if isinstance(r, dict) and isinstance(r.get("url"), str)]
    if not urls:
        step["status"] = "completed"
        steps[step_idx] = step
        plan.steps = steps  # type: ignore[assignment]
        try:
            state["plan"] = plan.model_dump()  # type: ignore[index]
            await _emit(config, state, plan)
        except Exception:
            pass
        return {"plan": plan.model_dump()}

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

    # Complete step
    step["status"] = "completed"
    steps[step_idx] = step
    plan.steps = steps  # type: ignore[assignment]
    try:
        state["plan"] = plan.model_dump()  # type: ignore[index]
        await _emit(config, state, plan)
    except Exception:
        pass

    return {"plan": plan.model_dump(), "evidence": existing_ev}


