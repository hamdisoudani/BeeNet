from __future__ import annotations

from typing import Any, List, Dict
import os
from langchain_core.runnables import RunnableConfig
from brain.state import AgentState, SearchResult
from brain.logger import get_logger
from copilotkit.langgraph import copilotkit_customize_config, copilotkit_emit_state
from brain.model import get_planner_model
from tools.planner import planner_tools
from tools.url_picker import pick_urls as strict_pick_urls
from langchain_core.messages import SystemMessage, HumanMessage
from langgraph.types import Command
from langgraph.graph import END


async def _emit(config: RunnableConfig, state: AgentState, plan: dict | None = None):
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


async def search_pick_node(state: AgentState, config: RunnableConfig) -> dict[str, Any] | None:
    """
    For the first step with status 'searching':
    - Ask LLM to pick a minimal set of URLs to crawl based on step goal, queries, and aggregated results
    - Save chosen URLs back into step.results (filter) and set status='reading'
    - Emit updated state
    """
    logger = get_logger("nodes.search_pick")
    config = copilotkit_customize_config(config, emit_tool_calls=False)

    # Parse plan - work with dict version to avoid Pydantic serialization issues
    try:
        plan_raw = state.get("plan")  # type: ignore[assignment]
        if isinstance(plan_raw, dict):
            plan = dict(plan_raw)  # Work with a copy
        else:
            plan = None
    except Exception:
        plan = None
    if not isinstance(plan, dict) or (plan.get("mode") or "") != "search":
        logger.info("SearchPick: no search plan; nothing to do")
        return None

    # Normalize steps to mutable dicts (they should already be dicts from other nodes)
    raw_steps: List[Any] = list((plan.get("steps") if isinstance(plan, dict) else []) or [])
    steps: List[Dict[str, Any]] = []
    from uuid import uuid4
    for s in raw_steps:
        if isinstance(s, dict):
            d = dict(s)  # Copy the dict
        elif isinstance(s, str):
            d = {"id": str(uuid4()), "title": s, "queries": [s], "results": [], "status": "pending"}
        else:
            # Should not happen if other nodes are working correctly
            d = {"id": str(uuid4()), "title": "Step", "queries": [], "results": [], "status": "pending"}
        
        # Ensure required fields
        d.setdefault("id", str(uuid4()))
        d.setdefault("title", "Step")
        d.setdefault("queries", [])
        d.setdefault("results", [])
        d.setdefault("status", "pending")
        steps.append(d)

    # Resolve active step via current_step_id, fallback to first 'searching'
    step_idx = None
    try:
        active_id = state.get("current_step_id")  # type: ignore[assignment]
    except Exception:
        active_id = None
    if isinstance(active_id, str) and active_id:
        for i, s in enumerate(steps):
            if str(s.get("id")) == active_id:
                step_idx = i
                break
    if step_idx is None:
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
    # Pull candidates from transient state map - these should be SearchResult objects
    try:
        cand_map = state.get("search_candidates", {})  # type: ignore[assignment]
        candidates_raw = cand_map.get(str(step.get("id")), []) if isinstance(cand_map, dict) else []
        # Convert to SearchResult objects if they're dicts (for backward compatibility)
        candidates: List[SearchResult] = []
        for c in candidates_raw:
            if isinstance(c, SearchResult):
                candidates.append(c)
            elif isinstance(c, dict):
                try:
                    # Convert dict to SearchResult
                    search_result = SearchResult(
                        title=c.get("title"),
                        link=c.get("link") or c.get("url", ""),
                        snippet=c.get("snippet"),
                        position=c.get("position"),
                        favicon=c.get("favicon")
                    )
                    candidates.append(search_result)
                except Exception:
                    continue
    except Exception:
        candidates = []

    # Extract candidate URLs for the tool call
    candidate_urls = [r.link for r in candidates]
    print("candidate_urls", candidate_urls)
    # Use strict tool-calling to select URLs with a strong persona/system prompt
    chosen: List[str] = []
    
    # Compute min/max bounds for guidance (not enforced in tool)
    try:
        suggested_min = max(1, int(os.getenv("PICKER_MIN_URLS", "1")))
    except Exception:
        suggested_min = 1
    try:
        suggested_max = max(suggested_min, int(os.getenv("PICKER_MAX_URLS", "3")))
    except Exception:
        suggested_max = max(suggested_min, 3)
    
    try:
        model = get_planner_model(config)
        # Bind STRICT picker tool (Pydantic schema) and disable parallel tool calls
        model_with_tool = model.bind_tools([strict_pick_urls], tool_choice="pick_urls", parallel_tool_calls=False)
        # Persona with clear role and constraints
        sys_text = (
            "You are a human-like web researcher evaluating Google search results. "
            "Your job is to pick the most relevant URLs to crawl for the current step goal.\n\n"
            "GUIDANCE:\n"
            f"- Suggested range: {suggested_min}-{suggested_max} URLs (but use your judgment)\n"
            f"- If you see more than {suggested_max} relevant sites, focus on the HIGHEST QUALITY ones\n"
            "- You must select at least 1 URL to proceed\n"
            "- Quality over quantity - better to pick fewer excellent sources than many mediocre ones\n\n"
            "MULTIPLE SOURCES STRATEGY:\n"
            "- For critical information (news, stock prices, exchange rates, breaking events), "
            "consider selecting 2-3 sources to cross-verify information\n"
            "- Single sources can fail: websites go down, contain outdated data, or have errors\n"
            "- Examples requiring multiple sources:\n"
            "  * Breaking news: Get from 2-3 news outlets (Reuters, AP, BBC)\n"
            "  * Stock/crypto prices: Use multiple financial sites (Yahoo Finance, Bloomberg, MarketWatch)\n"
            "  * Exchange rates: Cross-check currency sites (XE, X-Rates, Investing.com)\n"
            "  * Product comparisons: Check multiple review sites\n"
            "- For simple factual queries (company info, definitions), 1-2 authoritative sources may suffice\n\n"
            "Evaluate each URL like a human browsing Google:\n"
            "- Title: Does it directly match what you're looking for?\n"
            "- Snippet: Does the preview contain specific relevant information?\n"
            "- Position: Higher positions (1-3) are usually more authoritative\n"
            "- Domain: Prefer official sources, documentation, news sites; avoid forums, social media, PDFs\n\n"
            "You MUST respond ONLY by calling the pick_urls tool with your selected URLs. "
            "Choose the URLs with the highest probability of containing the exact information "
            "needed for this step when crawled."
        )

        # Build human message with step context and candidates for evaluation
        step_info = f"Step Goal: {title}\nQueries Used: {', '.join(queries or [])}\n\n"
        
        candidates_text = "Search Results to Evaluate:\n"
        for i, candidate in enumerate(candidates[:15], 1):  # Limit to top 15 for readability
            c_title = candidate.title or "No title"
            c_url = candidate.link
            c_snippet = candidate.snippet or "No snippet"
            c_position = candidate.position or "?"
            candidates_text += f"{i}. [{c_position}] {c_title}\n   URL: {c_url}\n   Snippet: {c_snippet}\n\n"
        
        human_message_content = (
            step_info + candidates_text + 
            f"\nGUIDANCE: Suggested {suggested_min}-{suggested_max} URLs, but use your judgment.\n"
            f"Focus on quality - pick the URLs most likely to contain the information needed for: {title}"
        )
        
        messages = [
            SystemMessage(content=sys_text),
            HumanMessage(content=human_message_content),
        ]
        # The model should call pick_urls with step_id, urls, min_urls, max_urls
        # But we need to manually provide the tool call context since the model can only see the human message
        # We'll provide the tool arguments in a structured way by calling the model differently
        
        # Create a modified model call that includes the tool arguments
        tool_call_context = {
            "step_id": str(step.get("id")),
            "candidate_urls": candidate_urls,  # Available URLs to choose from
        }
        
        # Add tool context to the human message
        human_message_with_context = human_message_content + f"\n\nAvailable URLs to choose from: {candidate_urls}"
        messages = [
            SystemMessage(content=sys_text),
            HumanMessage(content=human_message_with_context),
        ]
        
        resp = await model_with_tool.ainvoke(messages, config)
        # Extract tool call output
        tool_calls = getattr(resp, "tool_calls", []) or list(getattr(resp, "additional_kwargs", {}).get("tool_calls", []) or [])
        print("tool_calls", tool_calls)
        if tool_calls:
            # LangChain returns tool_calls with "args" populated
            tc = tool_calls[0]
            print("tc", tc)
            out = tc.get("args", {}) if isinstance(tc, dict) else getattr(tc, "args", {})
            urls = out.get("urls") if isinstance(out, dict) else None
            if isinstance(urls, list):
                chosen = [u for u in urls if isinstance(u, str)]
                # Ensure at least one URL is selected
                if not chosen and candidate_urls:
                    # Fallback: take the first candidate if LLM didn't select any
                    chosen = [candidate_urls[0]]
        if not tool_calls or not chosen:
            raise RuntimeError("picker_failed")
    except Exception:
        # Strict error handling: mark step completed with error to break loops, emit, and stop
        try:
            step_err = steps[step_idx]
            step_err["error"] = {"type": "picker_error", "message": "Failed to select URLs for this step."}
            step_err["status"] = "completed"
            steps[step_idx] = step_err
            plan["steps"] = steps  # Update dict directly
            state["plan"] = plan  # type: ignore[index]
            # Clear transient for this step
            sid = str(step_err.get("id"))
            return {"plan": plan, "search_candidates": {sid: []}, "error": {"type": "picker_error"}}
        except Exception:
            pass
        return Command(goto=END, update={"error": {"type": "picker_error"}})

    # Filter results to chosen URLs only and write into plan step results as SearchResult objects
    chosen_set = set(chosen)
    chosen_results: List[SearchResult] = [r for r in candidates if r.link in chosen_set]
    
    # Convert SearchResult objects to dicts for plan storage (to match PlanStep.results type)
    step["results"] = [r.model_dump() for r in chosen_results]
    step["status"] = "reading"
    steps[step_idx] = step
    
    # Update plan as plain dict to avoid Pydantic serialization issues
    plan["steps"] = steps
    try:
        state["plan"] = plan  # type: ignore[index]
        await _emit(config, state, plan)
    except Exception:
        pass

    logger.info("search_pick_node: selected %d URLs for step %s", len(chosen_results), str(step.get("id")))
    # Clear transient candidates and keep current_step_id for scraping
    return {"plan": plan, "search_candidates": {str(step.get("id")): []}, "current_step_id": str(step.get("id"))}




