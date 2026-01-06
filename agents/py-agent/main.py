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

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize Postgres checkpointer
    async with AsyncConnectionPool(
        conninfo=DB_URI,
        max_size=20,
        kwargs={"autocommit": True, "prepare_threshold": 0},
    ) as pool:
        checkpointer = AsyncPostgresSaver(pool)
        await checkpointer.setup()

        # Compile graph with persistence
        graph = workflow.compile(checkpointer=checkpointer)

        # Initialize Agent with persistent graph
        agent = LangGraphAGUIAgent(
            name="starterAgent",
            description="An example agent to use as a starting point for your own agent.",
            graph=graph,
        )

        # Register the endpoint dynamically
        # Note: add_langgraph_fastapi_endpoint typically adds routes to the app.
        # Calling it here ensures it uses the ready graph.
        add_langgraph_fastapi_endpoint(
            app=app,
            agent=agent,
            path="/",
        )

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
