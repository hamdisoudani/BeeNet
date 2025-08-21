from copilotkit import CopilotKitState
from typing import List, Literal, Optional, Any
from pydantic import BaseModel, Field


class SearchResult(BaseModel):
    title: Optional[str] = None
    url: Optional[str] = None
    favicon: Optional[str] = None
    # Provider relevance score (e.g., Tavily 0..1)
    score: Optional[float] = None


class PlanStep(BaseModel):
    id: str
    title: str
    queries: List[str] = Field(default_factory=list)
    results: List[SearchResult] = Field(default_factory=list)
    # Research execution phase for this step
    status: Literal["pending", "searching", "reading", "completed"] = "pending"
    # Optional research controls removed; rely on HQ dorks
    # Note: provider "answers" are not stored in steps anymore


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
    plan: Optional[ResearchPlan] = None
    # Rolling history of prior plans for robustness/analytics
    plans: List[dict] = Field(default_factory=list)
    # Error surface for UI: set when model/tool errors occur; may also be mirrored into plan.error
    error: Optional[dict] = None
    # Ephemeral evidence store: raw textual context extracted for selected sources.
    # IMPORTANT: This is for in-memory use by the agent and SHOULD NOT be emitted to the UI or persisted.
    # Each entry links to a plan step and contains the canonical url and markdown content.
    evidence: List[dict] = Field(default_factory=list)
    # your_custom_agent_state: str = ""