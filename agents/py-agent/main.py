"""
This serves the "sample_agent" agent. This is an example of self-hosting an agent
through our FastAPI integration. However, you can also host in LangGraph platform.
"""

import os
from dotenv import load_dotenv
# Load environment variables from .env at startup
load_dotenv()  # pylint: disable=wrong-import-position

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from copilotkit.integrations.fastapi import add_fastapi_endpoint
from copilotkit import CopilotKitRemoteEndpoint, LangGraphAGUIAgent
from brain.graph import workflow, DB_URI # Import workflow instead of graph to compile with checkpointer
from middleware import ProxyAuthAndModelMiddleware
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from contextlib import asynccontextmanager
from psycopg_pool import AsyncConnectionPool


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize Postgres checkpointer
    async with AsyncConnectionPool(
        # Use the DB_URI from graph.py or env
        conninfo=DB_URI,
        max_size=20,
        kwargs={"autocommit": True, "prepare_threshold": 0},
    ) as pool:
        checkpointer = AsyncPostgresSaver(pool)
        # Setup the schema if needed (first run)
        await checkpointer.setup()

        # Compile the graph with the checkpointer
        graph = workflow.compile(checkpointer=checkpointer)

        # Initialize SDK with the compiled graph
        sdk = CopilotKitRemoteEndpoint(
            agents=[
                LangGraphAGUIAgent(
                    name="starterAgent",
                    description="An example agent to use as a starting point for your own agent.",
                    graph=graph,
                )
            ],
        )

        # We need to register the route dynamically or attach SDK to app state?
        # add_fastapi_endpoint adds the route immediately.
        # But 'sdk' is created inside lifespan.
        #
        # Better approach: Create SDK globally but set graph later?
        # LangGraphAGUIAgent takes 'graph'.
        #
        # Alternative: Initialize the pool globally or use a global variable for graph.
        #
        # Let's try to setup the endpoint *inside* lifespan? No, routes must be added before startup usually?
        # Actually, FastAPI routes can be added later but it's not standard.
        #
        # Simplify: Just use the global `sdk` but update the agent's graph?
        # LangGraphAGUIAgent stores graph.
        #
        # Let's instantiate the pool and checkpointer at module level (global)?
        # AsyncPostgresSaver needs 'async with' or proper lifecycle management.
        #
        # If we want to use 'langgraph dev', we use langgraph.json and it handles this.
        # But for 'python main.py', we need to do it manually.
        #
        # Let's go with a startup event that initializes the graph.
        yield

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allow direct frontend access
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(ProxyAuthAndModelMiddleware)

# We need a placeholder graph for the global SDK if we want to add_fastapi_endpoint now.
# Or we delay add_fastapi_endpoint?
#
# Workaround: Compile with MemorySaver first, then swap?
#
# Actually, let's keep it simple for this step:
# We will use a global connection pool managed by the app?
#
# Or just rely on `langgraph-cli` for running the agent in dev?
# The user said: "also in the new copiltokit we can have the langgraph agent starts with langgraph dev without the need of that start file"
#
# So `main.py` might be obsolete for `langgraph dev` usage?
# But `main.py` is the entrypoint for `uvicorn`.
#
# If I use `langgraph dev`, I don't run `python main.py`. I run `langgraph dev`.
# And `langgraph.json` points to `brain/graph.py:graph`.
#
# In `brain/graph.py`, `graph = workflow.compile()`.
# When running via `langgraph dev`, we can configure persistence in `langgraph.json`?
# LangGraph CLI supports postgres checkpointer via config?
#
# If the user wants `langgraph dev` to work, we should ensure `brain/graph.py` exports a compiled graph.
#
# If I modify `brain/graph.py` to use `AsyncPostgresSaver`, it breaks without async context.
#
# Compromise:
# In `brain/graph.py`:
# 1. Try to initialize AsyncPostgresSaver if we are in an async loop? No.
#
# If the user wants to use `langgraph dev`, the standard way is often to use the built-in checkpointer of the platform (LangGraph Cloud) OR configure it.
#
# But for self-hosted (which `main.py` implies), we need to wire it up.
#
# Let's implement `main.py` correctly for `python main.py` execution (Postgres).
# AND ensure `langgraph dev` works (maybe defaulting to memory if `langgraph.json` doesn't specify?).
#
# To make `python main.py` work with Postgres:
# We need to run the async setup.
#
# Let's put the graph setup inside a startup event and use `add_fastapi_endpoint` there?
#
# Or simpler: Just use `MemorySaver` in `brain/graph.py` for now (so `langgraph dev` works easily)
# AND in `main.py`, override it with `PostgresSaver`.
#
# But `LangGraphAGUIAgent` takes the `graph`.
#
# Let's update `main.py`:

async def lifespan(app: FastAPI):
    # Setup Postgres
    async with AsyncConnectionPool(DB_URI, kwargs={"autocommit": True}) as pool:
        checkpointer = AsyncPostgresSaver(pool)
        await checkpointer.setup()
        # Re-compile workflow with postgres
        app.state.graph = workflow.compile(checkpointer=checkpointer)

        # We need to expose this graph to CopilotKit.
        # CopilotKitRemoteEndpoint takes agents list.
        # We can construct the SDK here.
        sdk = CopilotKitRemoteEndpoint(
            agents=[
                LangGraphAGUIAgent(
                    name="starterAgent",
                    description="Agent with Postgres persistence",
                    graph=app.state.graph,
                )
            ],
        )
        # We can't use add_fastapi_endpoint because it expects 'app' which is already created.
        # But add_fastapi_endpoint attaches routes.
        # We can call it here? Yes.
        add_fastapi_endpoint(app, sdk, "/copilotkit")
        yield

app = FastAPI(lifespan=lifespan)
# ... middlewares ...
# Remove global SDK init.

# add_langgraph_fastapi_endpoint(
#   app=app,
#   agent=LangGraphAGUIAgent(
#     name="starterAgent", # the name of your agent defined in langgraph.json
#     description="Describe your agent here, will be used for multi-agent orchestration",
#     graph=graph, # the graph object from your langgraph import
#   ),
#   path="/copilotkit", # the endpoint you'd like to serve your agent on
# )

def main():
    """Run the uvicorn server."""
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=True,
    )

if __name__ == "__main__":
    main()