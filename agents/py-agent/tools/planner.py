from __future__ import annotations

from typing import Any, List, Optional, Literal


def planner_tools() -> list[Any]:
    """
    Define the planner's internal tool(s). Exposed as a factory so nodes can import
    without bundling tool definitions inline.
    """
    from langchain_core.tools import tool
    from pydantic import BaseModel, Field

    class PlanControls(BaseModel):
        """Optional controls for a search step to target results."""
        time_range: Optional[Literal["any", "day", "week", "month", "year"]] = Field(
            default=None,
            description="Limit results to a recent window: any, day, week, month, or year.",
        )
        country: Optional[str] = Field(
            default=None, min_length=2, max_length=2,
            description="Two-letter country code (gl), e.g., 'us', 'gb', 'de'."
        )
        autocorrect: Optional[bool] = Field(
            default=True,
            description="Enable query autocorrect (default true)."
        )
        max_results: Optional[int] = Field(
            default=10, ge=1, le=50,
            description="Max results to fetch per query (1-50)."
        )

    class PlanStepInput(BaseModel):
        """A single step with a descriptive title, 1-3 high-signal queries, and optional controls."""
        title: str = Field(..., min_length=3, max_length=160, description="Short step goal, not a query.")
        queries: List[str] = Field(default_factory=list, description="1-3 specific web search queries for this step.")
        controls: Optional[PlanControls] = Field(default=None, description="Optional targeting controls for this step.")

    class SetResearchPlanArgs(BaseModel):
        """Strict schema for planning output. Prefer structured steps only."""
        mode: Literal["direct", "search"] = Field(description="Route: 'direct' answers now, 'search' gathers sources first.")
        reason: Optional[str] = Field(default=None, max_length=240, description="Short rationale for the chosen mode.")
        structured_steps: Optional[List[PlanStepInput]] = Field(
            default=None,
            description="For search mode: 1-6 steps with titles, 1-3 queries, and optional controls.")

    @tool(args_schema=SetResearchPlanArgs)
    def set_research_plan(
        mode: str,
        reason: Optional[str] = None,
        structured_steps: Optional[List[PlanStepInput]] = None,
    ) -> str:
        """
        INTERNAL: Set the research plan for routing. Must be called exactly once with:
        - mode: "direct" | "search"
        - reason: short rationale
        - structured_steps: list of { title, queries[1..3], controls? }
        Returns: "ok" if accepted.
        """
        return "ok"

    class PickUrlsArgs(BaseModel):
        """Strict schema for selecting URLs to crawl for a given step.
        Inputs include the current step, surrounding plan context, transient candidates, and recent evidence.
        """
        step_id: str = Field(..., description="The id of the current plan step")
        step_title: str = Field(..., description="Short goal/title for this step")
        queries: List[str] = Field(default_factory=list, description="Queries used to gather candidates")
        candidates: List[dict] = Field(default_factory=list, description="List of candidate results: {title,url,snippet,position?,favicon?,score?}")
        previous_steps: List[dict] = Field(default_factory=list, description="Completed steps before this step (id,title)")
        next_steps: List[dict] = Field(default_factory=list, description="Upcoming steps after this step (id,title)")
        evidence: List[dict] = Field(default_factory=list, description="Compact evidence objects from completed steps: {stepId,url,markdown?}")
        guidance: str = Field(
            default=(
                "Pick only the minimal set of high-quality URLs needed to answer the step. "
                "Favor authoritative sources, avoid duplicates and low-signal pages."
            ),
            description="Guidance to control scope and cost",
        )

    @tool(args_schema=PickUrlsArgs)
    def pick_urls(
        step_id: str,
        step_title: str,
        queries: List[str],
        candidates: List[dict],
        previous_steps: List[dict],
        next_steps: List[dict],
        evidence: List[dict],
        guidance: str = "",
    ) -> dict:
        """
        INTERNAL: Return structured selection of URLs to crawl now.
        Output: { "urls": ["https://...", ...] }
        """
        return {"urls": []}

    return [set_research_plan, pick_urls]


