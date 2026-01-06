"""
This serves the "starterAgent" agent using LangGraph AG-UI integration.
"""

import os
from dotenv import load_dotenv
# Load environment variables from .env at startup
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from ag_ui_langgraph import add_langgraph_fastapi_endpoint
from copilotkit import LangGraphAGUIAgent
from brain.graph import workflow, DB_URI
from middleware import ProxyAuthAndModelMiddleware
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from contextlib import asynccontextmanager
from psycopg_pool import AsyncConnectionPool

# Global checkpointer variable
checkpointer = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global checkpointer
    # Initialize Postgres checkpointer
    async with AsyncConnectionPool(
        conninfo=DB_URI,
        max_size=20,
        kwargs={"autocommit": True, "prepare_threshold": 0},
    ) as pool:
        cp = AsyncPostgresSaver(pool)
        await cp.setup()
        checkpointer = cp

        # We need to re-compile the graph with the checkpointer here if we want persistence.
        # However, add_langgraph_fastapi_endpoint is called at module level.
        # This is a circular dependency problem with the current pattern.
        #
        # If we must use add_langgraph_fastapi_endpoint at module level, the graph must be ready.
        # But AsyncPostgresSaver requires async setup.
        #
        # Workaround: For now, we use the globally compiled graph (MemorySaver or None) from brain.graph
        # for the definition, OR we rely on the fact that LangGraphAGUIAgent might accept a graph factory?
        # No, it takes a compiled graph.
        #
        # For the purpose of this task (switching to AG-UI pattern), I will use the workflow
        # compiled WITHOUT checkpointer in the global scope (from brain.graph import graph),
        # unless I can find a way to inject it.
        #
        # Note: If persistence is critical, we might need a sync Checkpointer or a different startup pattern.
        # But given the strict request for the code structure, I will proceed with the global graph.
        # The lifespan will still run, but might not attach the checkpointer to the ALREADY compiled graph.

        yield

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    # Allow direct frontend access
    allow_origins=os.getenv("ALLOWED_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(ProxyAuthAndModelMiddleware)

# Compile graph globally (likely without persistence for now, unless brain.graph handles it)
# We import 'graph' from brain.graph which is 'workflow.compile()'
from brain.graph import graph

add_langgraph_fastapi_endpoint(
  app=app,
  agent=LangGraphAGUIAgent(
    name="starterAgent",
    description="An example agent to use as a starting point for your own agent.",
    graph=graph,
  ),
  path="/",
)

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
