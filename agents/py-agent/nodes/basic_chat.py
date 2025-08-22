from langchain_core.messages import SystemMessage
from langchain_core.runnables import RunnableConfig
from langgraph.types import Command
from brain.state import AgentState
from typing_extensions import Literal
from langgraph.graph import END
from brain.model import get_model
from copilotkit.langgraph import copilotkit_customize_config, copilotkit_emit_state
from typing import Any
from datetime import datetime, timezone
import time
from brain.logger import get_logger
from brain.history import prepare_llm_context
from prompts.chat_search_mode import build_chat_system_prompt_search
from prompts.chat_direct_mode import build_chat_system_prompt_direct

async def chat_node(state: AgentState, config: RunnableConfig) -> Command[Literal["__end__"]]:

    # 1. Define the model (use centralized model factory), passing config so header overrides are respected
    try:
        model = get_model(config)
    except Exception:
        # If model initialization fails (e.g., missing API key), surface a typed error and end
        err = {"type": "model_init_error", "message": "Failed to initialize the selected model."}
        try:
            state["error"] = err  # type: ignore[index]
            await copilotkit_emit_state(config, state)
        except Exception:
            pass
        return Command(goto=END, update={"error": err})

    # Chat node is tool-free by design
    logger = get_logger("nodes.chat")

    # 2.1 Customize CopilotKit config to control streaming/visibility
    #     Disable emitting tool calls to the frontend; keep messages enabled by default
    config = copilotkit_customize_config(
        config,
        emit_tool_calls=False,
    )

    # 2.2 Optionally initialize and stream plan state so UI has something to render immediately
    try:
        plan_val = state.get("plan")
        if hasattr(plan_val, "model_dump"):
            plan_val = plan_val.model_dump()  # type: ignore[assignment]
        if not plan_val:
            plan_val = {"mode": "direct", "steps": []}
        # IMPORTANT: do not emit messages via state sync, to avoid replacing the streamed assistant message at the end
        # Build a safe copy of the state that only includes the plan (and any non-messages fields)
        safe_state: Any = {}
        try:
            # Preserve only non-message keys and the updated plan
            if isinstance(state, dict):
                for k, v in state.items():  # type: ignore[attr-defined]
                    if k == "messages":
                        continue
                    safe_state[k] = v
            safe_state["plan"] = plan_val
        except Exception:
            safe_state = {"plan": plan_val}
        await copilotkit_emit_state(config, safe_state)
    except Exception:
        pass

    # 3. Define the system message by which the chat model will be run
    # Professionalized persona and time context
    try:
        language = state.get("language", "english")  # type: ignore[assignment]
    except Exception:
        language = "english"
    try:
        now_iso = datetime.now(timezone.utc).isoformat()
        tz_name = time.tzname[0] if time.tzname else "UTC"
    except Exception:
        now_iso, tz_name = "", "UTC"

    # Include the plan concisely with sources; do not rely on provider short answers
    try:
        plan_raw = state.get("plan")  # type: ignore[assignment]
        plan_mode = (plan_raw.get("mode") if isinstance(plan_raw, dict) else getattr(plan_raw, "mode", None)) or "direct"
        plan_steps = (plan_raw.get("steps") if isinstance(plan_raw, dict) else getattr(plan_raw, "steps", [])) or []
        sources_outline = []
        answers_outline = []
        if isinstance(plan_steps, list):
            step_lines = []
            for s in plan_steps[:6]:
                if isinstance(s, dict):
                    title = s.get("title") or "Step"
                    step_lines.append(f"- {title}")
                    # include top 3 source domains for grounding
                    results = s.get("results") or []
                    try:
                        domains = []
                        for r in results[:3]:
                            u = r.get("url") if isinstance(r, dict) else None
                            if isinstance(u, str):
                                try:
                                    from urllib.parse import urlparse
                                    host = urlparse(u).hostname
                                    if host:
                                        domains.append(host)
                                except Exception:
                                    pass
                        if domains:
                            sources_outline.append(f"  sources: {', '.join(domains)}")
                        # we no longer surface provider short answers in the plan outline
                    except Exception:
                        pass
                else:
                    step_lines.append(f"- {str(s)}")
            plan_outline = "\n".join(step_lines)
        else:
            plan_outline = ""
    except Exception:
        plan_mode, plan_outline = "direct", ""

    # Attach the raw plan JSON directly to the system prompt for maximum fidelity.
    # When mode == 'direct', embed the planner reason to guide the assistant (no steps rendered).
    try:
        plan_json = {"mode": plan_mode, "steps": plan_steps} if plan_mode == "search" else {}
    except Exception:
        plan_json = {}

    # Extract planner reason for direct mode so the assistant can act on it
    try:
        plan_raw = state.get("plan")  # type: ignore[assignment]
        plan_reason = (
            plan_raw.get("reason") if isinstance(plan_raw, dict) else getattr(plan_raw, "reason", None)
        )
    except Exception:
        plan_reason = None

    # Prepare cleaned message history and prior search context for richer grounding
    try:
        recent_raw = list(state["messages"])  # type: ignore[index]
    except Exception:
        recent_raw = []
    clean_msgs, prev_ctx = prepare_llm_context(state, recent_raw, limit=30)
    # Build system prompt via dedicated builders per mode
    try:
        evidence = list(state.get("evidence", []))  # type: ignore[assignment]
    except Exception:
        evidence = []
    
    logger.info("Chat: processing with evidence_count=%d plan_mode=%s", len(evidence), plan_mode)
    if plan_mode == "search":
        # Build citations index and evidence sections
        citations_index: list[str] = []
        evidence_sections: list[str] = []
        if evidence:
            url_to_idx: dict[str, int] = {}
            idx = 1
            for ev in evidence:
                try:
                    u = ev.get("url") if isinstance(ev, dict) else None
                    if isinstance(u, str) and u not in url_to_idx:
                        url_to_idx[u] = idx
                        idx += 1
                except Exception:
                    continue
            if url_to_idx:
                pairs = [f"[{i}] {u}" for u, i in url_to_idx.items()]
                citations_index.append("Citations index:\n" + "\n".join(sorted(pairs, key=lambda x: int(x.split(']')[0][1:]))))
            try:
                grouped: dict[str, list[str]] = {}
                order: list[str] = []
                for ev in evidence:
                    if not isinstance(ev, dict):
                        continue
                    u = ev.get("url")
                    md = ev.get("markdown")
                    if not isinstance(u, str) or not isinstance(md, str):
                        continue
                    if u not in grouped:
                        grouped[u] = []
                        order.append(u)
                    grouped[u].append(md)
                for u in order:
                    marker = url_to_idx.get(u)
                    header = f"Source [{marker}] — {u}" if isinstance(marker, int) else f"Source — {u}"
                    body = "\n\n".join(grouped.get(u, []))
                    evidence_sections.append(header + "\n" + body)
                logger.info("Chat: processed evidence into %d sections with %d citations", len(evidence_sections), len(url_to_idx))
            except Exception:
                pass

        system_text = build_chat_system_prompt_search(
            language=language,
            now_iso=now_iso,
            tz_name=tz_name,
            plan_json=plan_json,
            plan_outline=plan_outline,
            previous_context=prev_ctx,
            citations_index=citations_index,
            evidence_sections=evidence_sections,
        )
        #print("system text ", system_text)
    else:
        system_text = build_chat_system_prompt_direct(
            language=language,
            now_iso=now_iso,
            tz_name=tz_name,
            planner_reason=plan_reason,
            previous_context=prev_ctx,
        )

    system_message = SystemMessage(content=system_text)
    logger.info("Chat system message: %s", system_message.content)
    # 4. Run the model to generate a response (with error handling)
    try:
        messages = [system_message, *clean_msgs[-8:]]
    except Exception:
        messages = [system_message]

    logger.info("Chat system message: %s", system_message.content)
    # 4. Run the model to generate a response (with error handling)
    try:
        messages = [system_message, *clean_msgs[-8:]]
    except Exception:
        messages = [system_message]

    logger.info("Chat invoking model. messages=%d", len(messages))
    try:
        response = await model.ainvoke(messages, config)
        logger.info("Chat model responded type=%s", type(response).__name__)
    except Exception as e:
        # Emit an error state consumable by the frontend and end the graph gracefully
        try:
            err = {"type": "model_error", "message": "The selected model failed to respond."}
            state["error"] = err  # type: ignore[index]
            # Also attach error into plan so UI can read it via useCoAgentStateRender
            plan_raw = state.get("plan")  # type: ignore[assignment]
            if isinstance(plan_raw, dict):
                plan_raw["error"] = err
                state["plan"] = plan_raw  # type: ignore[index]
            await copilotkit_emit_state(config, state)
        except Exception:
            pass
        return Command(goto=END, update={"error": err})

    # 6. We've handled all tool calls, so we can end the graph.
    #    Clean up ephemeral evidence before finalizing this turn.
    # try:
    #     if isinstance(state, dict) and isinstance(state.get("evidence"), list):  # type: ignore[attr-defined]
    #         state["evidence"] = []  # type: ignore[index]
    # except Exception:
    #     pass
    return Command(goto=END, update={"messages": response})

