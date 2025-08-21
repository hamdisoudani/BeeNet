from langgraph.graph import StateGraph, END
from brain.state import AgentState
from langgraph.checkpoint.memory import MemorySaver
from nodes.basic_chat import chat_node
from nodes.planner import planner_node
from nodes.search_collect import search_collect_node
from nodes.search_pick import search_pick_node
from nodes.scrape import scrape_node
from tools.web_search import tools
from langgraph.prebuilt import ToolNode
import os

# Define the workflow graph
workflow = StateGraph(AgentState)
workflow.add_node("planner_node", planner_node)
workflow.add_node("search_collect", search_collect_node)
workflow.add_node("search_pick", search_pick_node)
workflow.add_node("scrape", scrape_node)
workflow.add_node("chat_node", chat_node)
workflow.add_node("tool_node", ToolNode(tools=tools))

# New flow: planner -> (search_collect or chat)
# Conditional edges: collect -> pick -> scrape -> collect (loop) until no pending -> chat
def _has_pending(state: AgentState) -> bool:
    try:
        plan = state.get("plan")
        steps = (plan.get("steps") if isinstance(plan, dict) else []) or []
        # Any step not marked completed should be considered pending for the loop
        for s in steps:
            if not isinstance(s, dict):
                return True
            status = (s.get("status") or "pending").lower()
            if status != "completed":
                return True
        return False
    except Exception:
        return False

workflow.add_conditional_edges("search_collect", _has_pending, {True: "search_pick", False: "chat_node"})

def _needs_pick(state: AgentState) -> bool:
    try:
        plan = state.get("plan")
        steps = (plan.get("steps") if isinstance(plan, dict) else []) or []
        for s in steps:
            if isinstance(s, dict) and (s.get("status") or "") == "searching":
                return True
        return False
    except Exception:
        return False

# After picking, always proceed to scraping the selected URLs
workflow.add_edge("search_pick", "scrape")

def _needs_scrape(state: AgentState) -> bool:
    try:
        plan = state.get("plan")
        steps = (plan.get("steps") if isinstance(plan, dict) else []) or []
        for s in steps:
            if isinstance(s, dict) and (s.get("status") or "") == "reading":
                return True
        return False
    except Exception:
        return False

workflow.add_conditional_edges("scrape", _needs_scrape, {True: "search_collect", False: "search_collect"})
workflow.add_edge("tool_node", "chat_node")
workflow.set_entry_point("planner_node")

memory = MemorySaver()
graph = workflow.compile(checkpointer=memory)