from langgraph.graph import StateGraph, END
from brain.state import AgentState
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from nodes.basic_chat import chat_node
from nodes.planner import planner_node
from nodes.search_collect import search_collect_node
from nodes.search_pick import search_pick_node
from nodes.scrape import scrape_node
import os

# Define the workflow graph
workflow = StateGraph(AgentState)
workflow.add_node("planner_node", planner_node)
workflow.add_node("search_collect", search_collect_node)
workflow.add_node("search_pick", search_pick_node)
workflow.add_node("scrape", scrape_node)
workflow.add_node("chat_node", chat_node)

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
            if status not in ("completed",):
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

workflow.add_conditional_edges("scrape", _has_pending, {True: "search_collect", False: "chat_node"})
workflow.set_entry_point("planner_node")

# Postgres connection string from environment or hardcoded (for now, using the provided one)
DB_URI = os.getenv("POSTGRES_DB_URI", "postgresql://neondb_owner:npg_Pg5kLO6BmMNz@ep-dawn-sun-a4dk14yk-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require")

# Note: AsyncPostgresSaver needs an async context to be initialized properly in a real app.
# However, for 'langgraph dev' or 'uvicorn', we need to manage the connection lifecycle.
# For simplicity in this file (which is imported by main.py), we'll define the graph
# but the checkpointer needs to be instantiated with a connection pool.
#
# LangGraph's `compile(checkpointer=...)` expects an initialized checkpointer.
#
# If running via `langgraph dev` (langgraph-cli), it manages persistence differently (via langgraph.json).
# But here we are compiling it for use in our own FastAPI app (main.py) AND potentially langgraph-cli.
#
# Let's use a setup where we initialize the checkpointer if we are in the main app context.
# But `graph` object is a global.
#
# Warning: `AsyncPostgresSaver` requires async/await to setup.
# We might need to switch `main.py` to handle the graph compilation with checkpointer at startup.
# Or use `MemorySaver` as fallback if DB not ready, but we want Postgres.
#
# Ideally:
# graph = workflow.compile() # No checkpointer here?
# Then in main.py we use `graph` and pass checkpointer to CopilotKit?
# CopilotKit's `LangGraphAGUIAgent` takes a `graph` object. If that graph has a checkpointer, it uses it.
#
# Update: `langgraph-checkpoint-postgres` usage:
# async with AsyncPostgresSaver.from_conn_string(DB_URI) as checkpointer:
#     graph = workflow.compile(checkpointer=checkpointer)
#
# We can't do `async with` at module level easily.
#
# Workaround: For this file, we return the workflow and compile it in `main.py` or use a synchronous checkpointer wrapper if available?
# No, `AsyncPostgresSaver` is async.
#
# Let's keep `MemorySaver` here for now as a default to avoid import errors,
# and in `main.py` we will re-compile or inject the Postgres saver.
#
# Actually, the user wants Postgres.
# Let's try to set it up.

# For now, let's just compile without checkpointer here, and let main.py attach it?
# Or use `PostgresSaver` (sync) if available? `langgraph-checkpoint-postgres` usually has both?
# It seems `langgraph-checkpoint-postgres` only has `AsyncPostgresSaver` (based on docs).
#
# Let's rely on `main.py` to compile the graph with the checkpointer.
# We will export `workflow` as well.

graph = workflow.compile()