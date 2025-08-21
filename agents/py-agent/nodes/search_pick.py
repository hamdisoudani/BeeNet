from __future__ import annotations

from typing import Any, List, Dict
import os
from langchain_core.runnables import RunnableConfig
from brain.state import AgentState, ResearchPlan
from brain.logger import get_logger
from copilotkit.langgraph import copilotkit_customize_config, copilotkit_emit_state
from brain.model import get_planner_model


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


async def search_pick_node(state: AgentState, config: RunnableConfig) -> dict[str, Any] | None:
    """
    For the first step with status 'searching':
    - Ask LLM to pick a minimal set of URLs to crawl based on step goal, queries, and aggregated results
    - Save chosen URLs back into step.results (filter) and set status='reading'
    - Emit updated state
    """
    logger = get_logger("nodes.search_pick")
    config = copilotkit_customize_config(config, emit_tool_calls=False)

    # Parse plan
    try:
        plan_raw = state.get("plan")  # type: ignore[assignment]
        plan = ResearchPlan(**plan_raw) if isinstance(plan_raw, dict) else plan_raw
    except Exception:
        plan = None
    if not plan or plan.mode != "search":
        logger.info("SearchPick: no search plan; nothing to do")
        return None

    steps: List[Dict[str, Any]] = list(getattr(plan, "steps", []) or [])
    step_idx = None
    for i, s in enumerate(steps):
        if (s.get("status") or "") == "searching":
            step_idx = i
            break
    if step_idx is None:
        logger.info("SearchPick: no step in searching state")
        return None

    step = steps[step_idx]
    title = step.get("title") or ""
    queries = step.get("queries") or []
    candidates = step.get("results") or []

    # Trim candidates for prompt
    trimmed = []
    for it in candidates[:10]:
        if isinstance(it, dict) and isinstance(it.get("url"), str):
            trimmed.append({
                "title": it.get("title"),
                "url": it.get("url"),
                "snippet": it.get("snippet") or "",
                "position": it.get("position"),
            })

    max_crawl = max(1, int(os.getenv("SERPER_MAX_CRAWL_PER_STEP", "3")))
    sys = (
        "You select the minimal set of URLs to crawl to answer the user’s step goal. "
        "Prefer official/authoritative sources; avoid social, duplicate domains, and low-signal pages. "
        f"Return STRICT JSON as {{\"urls\": [..]}} with at most {max_crawl} items. No markdown."
    )
    # Include previous step for context if available
    prev_completed = next((s for s in steps if (s.get("status") == "completed")), None)
    user_msg = ""
    try:
        msgs = state.get("messages")  # type: ignore[assignment]
        if isinstance(msgs, list) and msgs:
            # first user message of the current turn is near the end
            last_user = next((m for m in reversed(msgs) if (m.get("role") or m.get("sender")) == "user"), None)
            if last_user and isinstance(last_user.get("content"), str):
                user_msg = last_user["content"]
    except Exception:
        user_msg = ""
    payload = {
        "previousStep": {"title": prev_completed.get("title")} if isinstance(prev_completed, dict) else None,
        "currentStep": {"title": title, "queries": queries},
        "userMessage": user_msg,
        "candidates": trimmed,
        "instruction": "Pick URLs to crawl"
    }

    try:
        model = get_planner_model(config)
        messages = [
            {"role": "system", "content": sys},
            {"role": "user", "content": str(payload)},
        ]
        resp = await model.ainvoke(messages)  # type: ignore[attr-defined]
        txt = getattr(resp, "content", None)
        import json
        data = json.loads(txt) if isinstance(txt, str) else {}
        urls = data.get("urls") if isinstance(data, dict) else []
        chosen: List[str] = [u for u in urls if isinstance(u, str)] if isinstance(urls, list) else []
    except Exception:
        chosen = []

    if not chosen:
        # fallback: top by provider order with domain diversity
        from urllib.parse import urlparse
        max_per_domain = max(1, int(os.getenv("SERPER_MAX_PER_DOMAIN", "1")))
        seen: dict[str, int] = {}
        for it in trimmed:
            u = it.get("url")
            try:
                host = urlparse(u).hostname or ""
            except Exception:
                host = ""
            if seen.get(host, 0) >= max_per_domain:
                continue
            seen[host] = seen.get(host, 0) + 1
            chosen.append(u)
            if len(chosen) >= max_crawl:
                break

    # Filter results to chosen URLs only
    chosen_set = set(chosen)
    step["results"] = [r for r in candidates if isinstance(r, dict) and r.get("url") in chosen_set]
    step["status"] = "reading"
    steps[step_idx] = step
    plan.steps = steps  # type: ignore[assignment]
    try:
        state["plan"] = plan.model_dump()  # type: ignore[index]
        await _emit(config, state, plan)
    except Exception:
        pass

    return {"plan": plan.model_dump()}


