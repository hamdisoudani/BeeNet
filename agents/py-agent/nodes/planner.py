from __future__ import annotations

from typing import List, Literal, Any, Optional
from datetime import datetime, timezone
import time
from langchain_core.messages import SystemMessage, AIMessage
from langchain_core.runnables import RunnableConfig
from langgraph.types import Command
from langgraph.graph import END
from brain.state import AgentState, ResearchPlan
from brain.model import get_planner_model
from brain.logger import get_logger
from copilotkit.langgraph import copilotkit_customize_config, copilotkit_emit_state
from brain.history import prepare_llm_context

def _now_iso_and_tz() -> tuple[str, str]:
    try:
        now = datetime.now(timezone.utc)
        now_iso = now.isoformat()
        tz_name = time.tzname[0] if time.tzname else "UTC"
        return now_iso, tz_name
    except Exception:
        return "", "UTC"


def _planner_tools() -> list[Any]:
    # Internal tool only for planning; not added to global ToolNode
    from langchain_core.tools import tool
    from pydantic import BaseModel, Field

    class PlanStepInput(BaseModel):
        """A single step with a descriptive title and 1-3 high-signal queries."""
        title: str = Field(..., min_length=3, max_length=160)
        queries: List[str] = Field(default_factory=list)

    class StepControls(BaseModel):
        """Deprecated: controls removed in favor of HQ dorks. Kept for backward compatibility."""
        include_domains: Optional[List[str]] = None
        days: Optional[int] = Field(default=None, ge=1, le=3650)

    class SetResearchPlanArgs(BaseModel):
        """Enforced schema for planning output (compatible across Pydantic versions)."""
        mode: Literal["direct", "search"]
        steps: List[str] = Field(default_factory=list)
        reason: Optional[str] = Field(default=None, max_length=240)
        structured_steps: Optional[List[PlanStepInput]] = None
        controls: Optional[List[StepControls]] = None  # aligns 1:1 with steps (deprecated)

    @tool(args_schema=SetResearchPlanArgs)
    def set_research_plan(
        mode: str,
        steps: List[str],
        reason: Optional[str] = None,
        structured_steps: Optional[List[PlanStepInput]] = None,
    ) -> str:
        """
        INTERNAL: Set the research plan for routing. Must be called exactly once with:
        - mode: "direct" | "search"
        - steps: <= 6 action-oriented steps
        - reason: short rationale
        - structured_steps (optional): list of { title, queries[1..3] } enforcing lengths and counts.
        Returns: "ok" if accepted.
        """
        return "ok"

    return [set_research_plan]


async def planner_node(
    state: AgentState, config: RunnableConfig
) -> Command[Literal["chat_node", "tool_node"]]:
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

    SYSTEM_PROMPT = (
        "You are a STRICT router that returns only a SINGLE tool call to set_research_plan.\n"
        "Never answer the user. Never produce prose or JSON outside the tool call.\n"
        "Never disclaim about lacking web access; execution is downstream, not your job.\n\n"
        f"Current time: {now_iso}\nTimezone: {tz_name}\n\n"
        "Agentic workflow reminder:\n"
        "- Your job is CLASSIFICATION only. You decide the plan; you do NOT execute it.\n"
        "- Choosing mode='search' DOES NOT mean you will search the web. A downstream agent will perform any web search.\n"
        "- Therefore, never avoid selecting 'search' due to your own browsing/tool limitations.\n\n"
        "How to decide mode:\n"
        "- Use mode='search' when the request implies real-time, current, dated, or source-backed information.\n"
        "  Examples: 'today', 'current', prices, weather, sports, releases, events, news, stock, schedule, now.\n"
        "- Use mode='direct' for timeless knowledge, tutorials, general reasoning, opinions.\n"
        "- If uncertain, prefer mode='search'.\n\n"
        "When mode='search', the steps MUST align exactly with the user request.\n"
        "- Steps are TITLES that describe the subgoal (they are NOT the web queries).\n"
        "- Each title should be specific and answer-oriented (e.g., 'Search current weather data for Canada').\n"
        "- Provide web queries (1–3 per step) in the 'structured_steps' field. Queries must be high-signal (HQ dorks) and include the current year ("
        f"{current_year}"
        ") to bias recency unless the user specifies a different date.\n"
        "- Do NOT include meta steps like 'Query APIs', 'Gather APIs', 'Summarize findings', or 'Synthesize research'.\n"
        "- Prefer 2-4 minimal steps; never exceed 6.\n"
        "- Think in terms of entities explicitly requested (locations, products, people) and create one step per entity/facet only if present in the user message.\n\n"
        "HQ dorks guidance (search best practices):\n"
        "- Be laser-focused on the user's intent and entities.\n"
        "- Prefer official docs and authoritative sources; bias with site: operator when helpful.\n"
        "- Avoid non-text sources (exclude YouTube, PDFs, images).\n"
        "- Use operators when helpful: site:, inurl:, intitle:, filetype:html.\n"
        "- Add recency terms (e.g., {current_year}) when relevant.\n\n"
        "Examples (good):\n"
        "- User: 'current weather in Canada, USA and Tunisia' → steps = [\"Search current weather data for Canada\", \"Search current weather data for USA\", \"Search current weather data for Tunisia\"]\n"
        "  Provide queries now in structured_steps, e.g., [\"current weather in Canada 2025 site:weatherapi.com\", \"Canada weather today 2025 site:weather.gov\"].\n"
        "- User: 'compare pricing for AWS S3 and GCP storage' → steps = [\"Search AWS S3 current pricing\", \"Search Google Cloud Storage current pricing\"]\n"
        "  Queries example per step: [\"AWS S3 pricing 2025 site:aws.amazon.com\", \"S3 pricing 2025 multi-region\"].\n\n"
        "Optional hint (when mode='search'): You may specify include_domains only when truly necessary; otherwise encode constraints in the dorks.\n\n"
        "Reuse context: If prior search already answered the request (see <previous_search_context>), prefer direct mode or minimal search steps that fill only the gaps.\n\n"
        "Examples (bad):\n"
        "- 'Query weather APIs' (too generic)\n"
        "- 'Summarize findings' (synthesis is performed downstream; do not plan it)\n"
        "- 'Gather sources' (not specific to the entities requested)\n\n"
        "What to return (MANDATORY):\n"
        "- Exactly one call to set_research_plan with args: {mode: 'direct'|'search', steps: string[<=6], reason: string, structured_steps?: {title, queries[]}[], controls?: StepControls[] }.\n"
        "- If mode='direct': steps must be [], and structured_steps must be omitted. Return only a short 'reason' (<= 160 chars).\n"
        "- If mode='search': steps (titles) must be specific and aligned to the user's request; put 1–3 high-quality queries per step in structured_steps.\n"
        "- controls: optional per-step constraints (domains, date window, depth, max_results). If provided, its length must equal steps length.\n"
        "- reason must be a short rationale for the choice.\n\n"
        "Bad: Any text or multiple tool calls.\n"
        "<instruction_and_rules>\n"
        "<examples>\n"
        "<user_request>\n"
        "What is the weather in Tokyo?"
        "<end_of_user_request>\n"
        "<bad_assistant_response>\n"
        "Call the `set_research_plan` with this data mode='direct' steps=['Determine if web data is required', 'If not, answer directly; otherwise search and synthesize with citations'] reason='I don't have search capabilities'\n"
        "<end_of_bad_assistant_response>\n"
        "<good_assistant_response>\n"
        "Call the `set_research_plan` with this data mode='search' steps=['Search current weather data for Tokyo'] reason='The user asked for the weather in Tokyo' structured_steps=[{'title': 'Search current weather data for Tokyo', 'queries': ['Tokyo weather today 2025 site:weather.com']}]\n"
        "<examples>\n"
        "<end_of_instruction_and_rules>\n"
    )

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
    controls: list[dict[str, Any]] | None = None
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
                    if not isinstance(title, str) or not isinstance(queries, list):
                        continue
                    q_list = [str(q) for q in queries[:3] if isinstance(q, (str, int, float))]
                    if not q_list:
                        continue
                    structured_steps.append({"title": title, "queries": q_list})
            # Parse optional controls (align by index to steps)
            cs = args.get("controls")
            if isinstance(cs, list):
                controls = []
                for c in cs[:6]:
                    if not isinstance(c, dict):
                        controls.append({})
                        continue
                    out: dict[str, Any] = {}
                    v = c.get("include_domains")
                    if isinstance(v, list):
                        out["include_domains"] = [str(x) for x in v[:6] if isinstance(x, (str, int, float))]
                    d = c.get("days")
                    if isinstance(d, (int, float)):
                        dd = int(d)
                        if 1 <= dd <= 3650:
                            out["days"] = dd
                    controls.append(out)
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
        plan_steps: list[dict[str, Any]] = []
        for idx, it in enumerate(structured_steps):
            ctrl = (controls[idx] if isinstance(controls, list) and idx < len(controls) else {}) if controls else {}
            plan_steps.append({
                "id": str(uuid4()),
                "title": it["title"],
                "queries": it["queries"],
                "results": [],
                "status": "pending",
                **ctrl,
            })
        plan_obj = ResearchPlan(mode=mode, steps=plan_steps, reason=reason)
    else:
        plan_obj = ResearchPlan(mode=mode, steps=steps, reason=reason)
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
    if plan_obj.mode == "search":
        return Command(update={"plan": plan_dict}, goto="search_collect")
    return Command(update={"plan": plan_dict}, goto="chat_node")


