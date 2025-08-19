from copilotkit import CopilotKitState
from typing import List, Literal, Optional, Any
from pydantic import BaseModel, Field


class SearchResult(BaseModel):
    title: Optional[str] = None
    url: Optional[str] = None
    favicon: Optional[str] = None


class PlanStep(BaseModel):
    id: str
    title: str
    queries: List[str] = Field(default_factory=list)
    results: List[SearchResult] = Field(default_factory=list)
    status: Literal["pending", "executing", "completed"] = "pending"
    # Optional research controls for Tavily
    include_domains: List[str] = Field(default_factory=list)
    exclude_domains: List[str] = Field(default_factory=list)
    days: Optional[int] = None  # freshness window in days
    max_results: Optional[int] = None
    search_depth: Optional[Literal["basic", "advanced"]] = None
    # Optional per-query short answers
    answers: Optional[List[str]] = None


class ResearchPlan(BaseModel):
    """Represents the routing plan for the current user request."""

    mode: Literal["direct", "search"] = Field(
        default="direct",
        description="Whether to answer directly or perform a web search first.",
    )
    # Backward-compatible: allow strings or structured steps
    steps: List[Any] = Field(default_factory=list, description="Execution steps.")
    reason: Optional[str] = Field(default=None, description="Short rationale for the chosen mode.")


class AgentState(CopilotKitState):
    """
    Here we define the state of the agent

    In this instance, we're inheriting from CopilotKitState, which will bring in
    the CopilotKitState fields. We're also adding a custom field, `proverbs`, and
    a `plan` that controls whether the agent should search the web or answer directly.
    """

    proverbs: List[str] = Field(default_factory=list)
    plan: Optional[ResearchPlan] = None
    # Rolling history of prior plans for robustness/analytics
    plans: List[dict] = Field(default_factory=list)
    # Error surface for UI: set when model/tool errors occur; may also be mirrored into plan.error
    error: Optional[dict] = None
    # your_custom_agent_state: str = ""