from __future__ import annotations

from typing import List, Literal, Any, Optional
from datetime import datetime, timezone
import time
from langchain_core.messages import SystemMessage, AIMessage
from langchain_core.runnables import RunnableConfig
from langgraph.types import Command
from langgraph.graph import END
from brain.state import AgentState, ResearchPlan, PlanStep, PlanControls
from brain.model import get_planner_model
from brain.logger import get_logger
from copilotkit.langgraph import copilotkit_customize_config, copilotkit_emit_state
from brain.history import prepare_llm_context
from prompts.planner import build_planner_system_prompt
from tools.planner import planner_tools

def _now_iso_and_tz() -> tuple[str, str]:
    try:
        now = datetime.now(timezone.utc)
        now_iso = now.isoformat()
        tz_name = time.tzname[0] if time.tzname else "UTC"
        return now_iso, tz_name
    except Exception:
        return "", "UTC"


def _planner_tools() -> list[Any]:
    # Delegate to shared tools module for cleanliness
    return planner_tools()


async def planner_node(
    state: AgentState, config: RunnableConfig
) -> Command[Literal["chat_node", "search_collect"]]:
    logger = get_logger("nodes.planner")
    try:
      model = get_planner_model(config)
    except Exception:
      # Typed error for planner model init failures
      try:
        err = {"type": "planner_model_init_error", "message": "Failed to initialize planner model."}
        state["error"] = err  # type: ignore[index]
        await copilotkit_emit_state(config, state)
      except Exception:
        pass
      return Command(goto=END, update={"error": {"type": "planner_model_init_error"}})

    # Ensure CopilotKit streaming config is set (do not emit tool calls to UI)
    config = copilotkit_customize_config(
        config,
        emit_tool_calls=False,
    )

    now_iso, tz_name = _now_iso_and_tz()
    current_year = datetime.now(timezone.utc).year

    SYSTEM_PROMPT = build_planner_system_prompt(now_iso=now_iso, tz_name=tz_name, current_year=current_year)

    # Include cleaned conversation + previous search context for planning
    try:
        recent_messages = list(state["messages"])  # type: ignore[index]
    except Exception:
        recent_messages = []
    clean_msgs, prev_ctx = prepare_llm_context(state, recent_messages, limit=30)
    prompt_with_prev = SYSTEM_PROMPT + ("\n<previous_search_context>\n" + str(prev_ctx) + "\n</previous_search_context>\n" if prev_ctx.get("previous_searches") else "")
    messages = [SystemMessage(content=prompt_with_prev), *clean_msgs]

    try:
        model_with_tool = model.bind_tools(
            _planner_tools(),
            tool_choice="set_research_plan"
        )
        logger.info("Planner invoking model with tool set_research_plan. Messages=%d", len(messages))
        response = await model_with_tool.ainvoke(messages, config)
        logger.info("Planner received response type=%s has_tool_calls=%s", type(response).__name__, bool(getattr(response, "tool_calls", None)))
    except Exception:
        # Typed error, no raw details
        try:
            err = {"type": "planner_error", "message": "Planner failed to run. Please try again or switch models."}
            state["error"] = err  # type: ignore[index]
            await copilotkit_emit_state(config, state)
        except Exception:
            pass
        return Command(goto=END, update={"error": err})

    # Extract the tool call
    mode: str = "direct"
    steps: List[str] = []
    reason: str | None = None

    structured_steps: list[dict[str, Any]] | None = None
    try:
        if isinstance(response, AIMessage) and response.tool_calls:
            tool_call = response.tool_calls[0]
            args = tool_call.get("args", {}) if isinstance(tool_call, dict) else getattr(tool_call, "args", {})
            mode = str(args.get("mode", "direct")).strip().lower()
            steps_val = args.get("steps", [])
            if isinstance(steps_val, list):
                steps = [str(s) for s in steps_val if isinstance(s, (str, int, float))][:6]
            reason_val = args.get("reason")
            if isinstance(reason_val, (str, int, float)):
                reason = str(reason_val)
            ss = args.get("structured_steps")
            if isinstance(ss, list):
                structured_steps = []
                for item in ss[:6]:
                    if not isinstance(item, dict):
                        continue
                    title = item.get("title")
                    queries = item.get("queries")
                    controls_in = item.get("controls")
                    if not isinstance(title, str) or not isinstance(queries, list):
                        continue
                    q_list = [str(q) for q in queries[:3] if isinstance(q, (str, int, float))]
                    if not q_list:
                        continue
                    ctrl: dict[str, Any] | None = None
                    if isinstance(controls_in, dict):
                        ctrl = {}
                        tr = controls_in.get("time_range")
                        if isinstance(tr, str) and tr in ("any","day","week","month","year"):
                            ctrl["time_range"] = tr
                        gl = controls_in.get("country")
                        if isinstance(gl, str) and 2 <= len(gl) <= 2:
                            ctrl["country"] = gl.lower()
                        hl = controls_in.get("language")
                        if isinstance(hl, str) and 2 <= len(hl) <= 5:
                            ctrl["language"] = hl
                        ac = controls_in.get("autocorrect")
                        if isinstance(ac, bool):
                            ctrl["autocorrect"] = ac
                        mr = controls_in.get("max_results")
                        if isinstance(mr, (int, float)):
                            mri = int(mr)
                            if 1 <= mri <= 50:
                                ctrl["max_results"] = mri
                    structured_steps.append({"title": title, "queries": q_list, **({"controls": ctrl} if ctrl else {})})
            logger.info(
                "Planner parsed set_research_plan: mode=%s steps=%d structured_steps=%s",
                mode,
                len(steps),
                bool(structured_steps),
            )
        else:
            # Missing tool call; treat as typed error and end
            try:
                err = {
                    "type": "planner_toolcall_unsupported",
                    "message": "The selected model does not support tool calling required for planning. Please choose a model with tool calling and try again.",
                }
                state["error"] = err  # type: ignore[index]
                await copilotkit_emit_state(config, state)
            except Exception:
                pass
            return Command(goto=END, update={"error": err})
    except Exception:
        try:
            err = {"type": "planner_parse_error", "message": "Planner returned an invalid plan."}
            state["error"] = err  # type: ignore[index]
            await copilotkit_emit_state(config, state)
        except Exception:
            pass
        return Command(goto=END, update={"error": err})

    if mode not in ("direct", "search"):
        mode = "direct"
    # If direct mode: enforce no steps; only rationale
    if mode == "direct":
        steps = []
    # If search mode and steps missing, synthesize a minimal specific step later

    # Build plan; prefer structured_steps when available
    if structured_steps:
        from uuid import uuid4
        plan_steps: list[PlanStep] = []
        for idx, it in enumerate(structured_steps):
            # Create proper PlanControls object if controls exist
            controls_obj = None
            if isinstance(it.get("controls"), dict):
                try:
                    controls_obj = PlanControls(**it["controls"])
                except Exception:
                    controls_obj = None
            
            # Create proper PlanStep object
            plan_step = PlanStep(
                id=str(uuid4()),
                title=it["title"],
                queries=it["queries"],
                results=[],
                status="pending",
                controls=controls_obj
            )
            plan_steps.append(plan_step)
        # Create ResearchPlan with proper PlanStep objects
        plan_obj = ResearchPlan(mode=mode, steps=plan_steps, reason=reason)
    else:
        # If model returned no structured steps in search mode, synthesize one minimal step from last user message
        if mode == "search" and not steps:
            try:
                last_user = next((m for m in reversed(clean_msgs) if getattr(m, "type", None) == "human" or getattr(m, "role", None) == "user"), None)
                last_q = (last_user.content if last_user else "").strip() if last_user else ""
                fallback_title = last_q[:120] or "Search the web"
                fallback_step = PlanStep(
                    id=str(uuid4()),
                    title=fallback_title,
                    queries=[fallback_title],
                    results=[],
                    status="pending"
                )
                plan_obj = ResearchPlan(mode=mode, steps=[fallback_step], reason=reason)
            except Exception:
                plan_obj = ResearchPlan(mode=mode, steps=[], reason=reason)
        else:
            plan_obj = ResearchPlan(mode=mode, steps=[], reason=reason)
    plan_dict = plan_obj.model_dump()  # ensure JSON-serializable for frontend

    # Stream the decided plan to the frontend immediately and append to history
    try:
        state["plan"] = plan_dict  # type: ignore[index]
        # Append to rolling history with a turn identifier
        from uuid import uuid4
        entry = {"turnId": str(uuid4()), "timestamp": datetime.now(timezone.utc).isoformat(), **plan_dict}
        try:
            plans = list(state.get("plans", []))  # type: ignore[assignment]
        except Exception:
            plans = []
        plans.append(entry)
        state["plans"] = plans  # type: ignore[index]
        await copilotkit_emit_state(config, state)
    except Exception:
        pass

    logger.info("Planner decided mode=%s; routing accordingly", plan_obj.mode)
    logger.info("Planner decided plan=%s", plan_obj)
    if plan_obj.mode == "search":
        return Command(update={"plan": plan_dict}, goto="search_collect")
    return Command(update={"plan": plan_dict}, goto="chat_node")


