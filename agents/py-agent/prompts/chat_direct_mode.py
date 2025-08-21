from typing import Any, Dict, Optional


def build_chat_system_prompt_direct(
    *,
    language: str,
    now_iso: str,
    tz_name: str,
    planner_reason: Optional[str] = None,
    previous_context: Optional[Dict[str, Any]] = None,
) -> str:
    """
    Build a strong system prompt for chat when plan.mode == 'direct'.
    Emphasizes clarity, correctness, and asking for clarification when needed.
    """
    principles = (
        f"You are BeeNet — a precise, helpful assistant. Communicate in {language}.\n"
        f"Current time: {now_iso}\nTimezone: {tz_name}\n\n"
        "Principles:\n"
        "- Be concise, structured, and correct.\n"
        "- Think step-by-step internally; present a clean final answer.\n"
        "- If unsure, ask a brief clarifying question before answering.\n"
        "- Never fabricate data.\n"
    )

    planner_note = (f"Planner note: {planner_reason}\n\n" if isinstance(planner_reason, str) and planner_reason.strip() else "")
    prev_block = (
        "<previous_search_context>\n" + str(previous_context) + "\n</previous_search_context>\n\n"
        if previous_context and previous_context.get("previous_searches")
        else ""
    )

    return principles + planner_note + prev_block


