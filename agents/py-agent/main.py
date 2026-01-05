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
from copilotkit import CopilotKitRemoteEndpoint, LangGraphAgent
from brain.graph import graph
from middleware import ProxyAuthAndModelMiddleware
from copilotkit import CopilotKitRemoteEndpoint, LangGraphAGUIAgent
from brain.graph import graph
from middleware import ProxyAuthAndModelMiddleware


app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    # Restrict origins; agent is intended to be called behind the proxy
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(ProxyAuthAndModelMiddleware)
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