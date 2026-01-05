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

        add_fastapi_endpoint(app, sdk, "/copilotkit")
        yield

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    # Allow direct frontend access
    allow_origins=["*"],
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
