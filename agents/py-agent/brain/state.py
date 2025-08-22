from copilotkit import CopilotKitState
from typing import List, Literal, Optional, Any
from pydantic import BaseModel, Field


class SearchResult(BaseModel):
    """Search result from Serper API matching organic results structure."""
    title: Optional[str] = None
    link: str = Field(..., description="URL from Serper 'link' field")
    snippet: Optional[str] = None
    position: Optional[int] = Field(default=None, description="Search engine position")
    favicon: Optional[str] = Field(default=None, description="Generated favicon URL")
    # Keep url as alias for backward compatibility
    
    @property
    def url(self) -> str:
        """Backward compatibility property."""
        return self.link


class PlanControls(BaseModel):
    """Optional targeting controls for a search step."""
    time_range: Optional[Literal["any", "day", "week", "month", "year"]] = Field(
        default=None, description="Limit results to a recent window."
    )
    country: Optional[str] = Field(default=None, min_length=2, max_length=2, description="Two-letter country code (gl).")
    autocorrect: Optional[bool] = Field(default=True, description="Enable query autocorrect.")
    max_results: Optional[int] = Field(default=10, ge=1, le=50, description="Max results to fetch per query.")


class PlanStep(BaseModel):
    id: str
    title: str
    queries: List[str] = Field(default_factory=list)
    results: List[SearchResult] = Field(default_factory=list)
    # Research execution phase for this step
    status: Literal["pending", "searching", "reading", "completed"] = "pending"
    controls: Optional[PlanControls] = Field(default=None, description="Optional per-step search controls.")
    # Note: provider "answers" are not stored in steps anymore


class ResearchPlan(BaseModel):
    """Represents the routing plan for the current user request."""

    mode: Literal["direct", "search"] = Field(
        default="direct",
        description="Whether to answer directly or perform a web search first.",
    )
    steps: List[PlanStep] = Field(default_factory=list, description="Execution steps.")
    reason: Optional[str] = Field(default=None, description="Short rationale for the chosen mode.")


class AgentState(CopilotKitState):
    """
    Here we define the state of the agent

    In this instance, we're inheriting from CopilotKitState, which will bring in
    the CopilotKitState fields. We're also adding a custom field, `proverbs`, and
    a `plan` that controls whether the agent should search the web or answer directly.
    """
    # Keep plan as a plain dictionary to avoid Pydantic coercion warnings downstream
    plan: Optional[dict[str, Any]] = None
    # Rolling history of prior plans for robustness/analytics
    plans: List[dict] = Field(default_factory=list)
    # Error surface for UI: set when model/tool errors occur; may also be mirrored into plan.error
    error: Optional[dict] = None
    # Ephemeral evidence store: raw textual context extracted for selected sources.
    # IMPORTANT: This is for in-memory use by the agent and SHOULD NOT be emitted to the UI or persisted.
    # Each entry links to a plan step and contains the canonical url and markdown content.
    evidence: List[dict] = Field(default_factory=list)
    # Transient search candidates per step id (NOT part of the plan; never emitted/persisted)
    # Shape: { [stepId]: Array<{ title, url, favicon?, position?, snippet?, score? }> }
    search_candidates: dict[str, List[dict]] = Field(default_factory=dict)
    # Active step being processed across nodes; set by search_collect, consumed by pick/scrape
    current_step_id: Optional[str] = None
    # your_custom_agent_state: str = ""