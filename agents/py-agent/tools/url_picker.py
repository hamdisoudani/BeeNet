from __future__ import annotations

from typing import Any, List, Optional

from langchain_core.tools import tool
from pydantic import BaseModel, Field, HttpUrl, field_validator


class Candidate(BaseModel):
    """
    A single candidate result from search_collect_node.
    Only the fields used by the picker are modeled here.
    """

    title: Optional[str] = Field(default=None, description="Result title")
    url: HttpUrl | str = Field(..., description="Canonical result URL")
    snippet: Optional[str] = Field(default=None, description="Short descriptive snippet")
    position: Optional[int] = Field(default=None, ge=1, description="Search engine position (1 = top)")
    favicon: Optional[str] = Field(default=None, description="Favicon URL if available")
    score: Optional[float] = Field(default=None, description="Optional provider score 0..1")

    @field_validator("url")
    @classmethod
    def _coerce_url(cls, v: Any) -> str:
        # Accept strings and HttpUrl; normalize to string
        return str(v)


class PickUrlsArgs(BaseModel):
    """Simplified schema for selecting URLs to crawl for a given step.

    The picker chooses the most relevant URLs from the provided candidates
    based on the step goal.
    """

    step_id: str = Field(..., description="The id of the current plan step")
    urls: List[str] = Field(..., min_items=1, description="Selected URLs to crawl (must select at least 1)")


@tool(args_schema=PickUrlsArgs)
def pick_urls(
    step_id: str,
    urls: List[str],
) -> dict:
    """
    INTERNAL: Return structured selection of URLs to crawl now.
    Output: { "urls": ["https://...", ...] }
    """
    # This function body is not executed by the model; it is used for schema only.
    # Returning an empty structure is acceptable; callers validate and post-process.
    return {"urls": []}


tools = [pick_urls]


