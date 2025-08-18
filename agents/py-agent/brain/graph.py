from langgraph.graph import StateGraph, END
from brain.state import AgentState
from langgraph.checkpoint.memory import MemorySaver
from nodes.basic_chat import chat_node
from nodes.planner import planner_node
from nodes.research import research_node
from tools.web_search import tools
from langgraph.prebuilt import ToolNode
import os

# Define the workflow graph
workflow = StateGraph(AgentState)
workflow.add_node("planner_node", planner_node)
workflow.add_node("research_node", research_node)
workflow.add_node("chat_node", chat_node)
workflow.add_node("tool_node", ToolNode(tools=tools))

# New flow: planner -> (research or chat)
# Conditional edge after research: if pending steps remain -> research_node; else -> chat_node
def _has_pending(state: AgentState) -> bool:
    try:
        plan = state.get("plan")
        steps = (plan.get("steps") if isinstance(plan, dict) else []) or []
        return any(((s.get("status") if isinstance(s, dict) else None) or "pending") == "pending" for s in steps)
    except Exception:
        return False

workflow.add_conditional_edges(
    "research_node",
    _has_pending,
    {True: "research_node", False: "chat_node"},
)
workflow.add_edge("tool_node", "chat_node")
workflow.set_entry_point("planner_node")

memory = MemorySaver()
graph = workflow.compile(checkpointer=memory)