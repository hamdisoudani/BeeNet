from __future__ import annotations

from typing import Any, Dict, List, Tuple


def _is_agent_state_message(msg: Any) -> bool:
    try:
        # LangChain Message API
        add = getattr(msg, "additional_kwargs", None)
        if isinstance(add, dict) and ("state" in add or "agentName" in add):
            return True
        # Dict-based message (persisted)
        if isinstance(msg, dict) and msg.get("role") == "assistant" and isinstance(msg.get("state"), dict):
            return True
    except Exception:
        pass
    return False


def sanitize_messages_for_llm(raw_messages: List[Any], limit: int = 30) -> List[Any]:
    """Return the most recent messages excluding agent_state payloads and empty assistant messages.

    Keeps original message instances (HumanMessage/AIMessage) when provided to preserve formatting
    for downstream LangChain models.
    """
    try:
        msgs = list(raw_messages or [])
    except Exception:
        msgs = []
    # Keep last N, then filter
    tail = msgs[-abs(int(limit or 30)) :]
    out: List[Any] = []
    for m in tail:
        try:
            if _is_agent_state_message(m):
                continue
            # Skip empty assistant messages
            content = getattr(m, "content", None) if not isinstance(m, dict) else m.get("content")
            role = getattr(m, "type", None) or getattr(m, "role", None)
            if (role == "ai" or role == "assistant") and (not isinstance(content, str) or not content.strip()):
                continue
            out.append(m)
        except Exception:
            continue
    return out


def build_previous_search_context(state_like: Any, max_entries: int = 5) -> Dict[str, Any]:
    """Summarize prior search plans into a compact context object for prompts.

    Excludes direct-mode plans. For each search step, include title, queries, total_results,
    and top_results (score >= 0.8) without favicons, plus any short answers. Includes the plan reason.
    """
    try:
        plans = list((state_like or {}).get("plans", [])) if isinstance(state_like, dict) else list(getattr(state_like, "plans", []) or [])
    except Exception:
        plans = []
    entries: List[Dict[str, Any]] = []
    for entry in reversed(plans):  # newest first
        if not isinstance(entry, dict):
            continue
        try:
            if str(entry.get("mode")) != "search":
                continue
            steps = entry.get("steps") or []
            if not isinstance(steps, list) or len(steps) == 0:
                continue
            reason = entry.get("reason")
            compact_steps: List[Dict[str, Any]] = []
            for s in steps:
                if not isinstance(s, dict):
                    continue
                results = s.get("results") or []
                if not isinstance(results, list):
                    results = []
                top = []
                for r in results:
                    if not isinstance(r, dict):
                        continue
                    score = r.get("score")
                    try:
                        sc = float(score) if score is not None else 0.0
                    except Exception:
                        sc = 0.0
                    if sc >= 0.8:
                        top.append({"title": r.get("title"), "url": r.get("url"), "score": sc})
                compact_steps.append({
                    "title": s.get("title"),
                    "queries": s.get("queries") or [],
                    "total_results": len(results),
                    "top_results": top[:5],
                    "answers": s.get("answers") or [],
                })
            entries.append({
                "reason": reason,
                "steps": compact_steps,
            })
            if len(entries) >= max_entries:
                break
        except Exception:
            continue
    return {"previous_searches": entries}


def prepare_llm_context(state_like: Any, raw_messages: List[Any], *, limit: int = 30) -> Tuple[List[Any], Dict[str, Any]]:
    """Convenience helper used by nodes: returns (clean_messages, prior_search_context)."""
    cleaned = sanitize_messages_for_llm(raw_messages, limit=limit)
    prev = build_previous_search_context(state_like)
    return cleaned, prev


