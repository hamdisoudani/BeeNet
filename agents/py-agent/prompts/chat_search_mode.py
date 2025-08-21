from typing import Any, Dict, List, Optional


def build_chat_system_prompt_search(
    *,
    language: str,
    now_iso: str,
    tz_name: str,
    plan_json: Dict[str, Any],
    plan_outline: str,
    previous_context: Optional[Dict[str, Any]] = None,
    citations_index: Optional[List[str]] = None,
    evidence_sections: Optional[List[str]] = None,
) -> str:
    """
    Build a strong system prompt for chat when plan.mode == 'search'.
    - Includes principles, time context, plan outline, prior context
    - Injects citations index and verbatim evidence sections
    - Instructs strict citation usage and no extra searching
    """
    principles = (
        f"You are BeeNet — a precise, helpful assistant. Communicate in {language}.\n"
        f"Current time: {now_iso}\nTimezone: {tz_name}\n\n"
        "Principles:\n"
        "- Be concise, structured, and citation-driven.\n"
        "- Use ONLY the Evidence provided below to answer; do not search further.\n"
        "- When making a claim, append inline citations like [1](url), [2](url).\n"
        "- If evidence is insufficient, say so and request clarification.\n"
        "- Never fabricate data.\n"
    )

    plan_block = """Plan (JSON):
```json
%s
```
""" % (str(plan_json),)

    outline_block = ("Plan outline:\n" + plan_outline + "\n\n") if plan_outline else ""
    prev_block = (
        "<previous_search_context>\n" + str(previous_context) + "\n</previous_search_context>\n\n"
        if previous_context and previous_context.get("previous_searches")
        else ""
    )

    citations_block = ("\n".join(citations_index) + "\n\n") if citations_index else ""
    evidence_block = ("\n\n".join(evidence_sections) + "\n\n") if evidence_sections else ""

    instructions = (
        "Instructions: Use the Evidence verbatim to answer the user's question. "
        "Do not invent facts. Add inline citations using the index (e.g., [1](url)) "
        "exactly where claims are made. End with a short 'Sources' section listing [n] Label — url.\n"
    )

    return principles + plan_block + outline_block + prev_block + citations_block + evidence_block + instructions


