from langchain_core.tools import tool
from typing import List, Dict, Any
from brain.logger import get_logger
import os
import re
from brain.context import get_tavily_api_key


@tool
def tavily_search(query: str, max_results: int = 5) -> Dict[str, Any]:
    """
    Search the web using Tavily and return a dict with:
    - answer: concise LLM-generated answer (if available)
    - results: list[{title, url, favicon?, score?}] (no page content)
    """
    logger = get_logger("tools.tavily")
    try:
        from tavily import TavilyClient
    except Exception as import_error:
        logger.exception("Tavily import failed: %s", import_error)
        return {"answer": None, "results": [], "error": f"Missing dependency: {import_error}"}

    # Sanitize input and enforce reasonable limits for security and performance
    try:
        safe_query = str(query or "").strip()
        # Collapse whitespace and strip obvious control chars
        safe_query = re.sub(r"\s+", " ", safe_query)
        safe_query = safe_query[:512]
        safe_max = max(1, min(int(max_results or 5), int(os.getenv("TAVILY_MAX_RESULTS", "5"))))

        api_key = get_tavily_api_key() or os.getenv("TAVILY_API_KEY", "")
        if not api_key:
            return {"answer": None, "results": [], "error": "tavily_missing_key"}
        client = TavilyClient(api_key=api_key)
        logger.info("Tavily search: max_results=%d", safe_max)
        raw = client.search(
            query=safe_query,
            max_results=safe_max,
            include_answer=True,
            include_favicon=True,
        )
        # Expected shape is a dict with a 'results' list; handle other shapes defensively
        normalized: List[Dict[str, Any]] = []
        answer_val = None
        query_val = None
        response_time_val = None
        images_val = None
        if isinstance(raw, dict):
            results_list = raw.get("results")
            if isinstance(results_list, list):
                for item in results_list:
                    if isinstance(item, dict):
                        # Prefer Tavily favicon if present, fallback derived by consumer
                        entry: Dict[str, Any] = {
                            "title": item.get("title"),
                            "url": item.get("url"),
                            "score": item.get("score"),
                        }
                        if isinstance(item.get("favicon"), str):
                            entry["favicon"] = item["favicon"]
                        normalized.append(entry)
            # Capture meta fields if available
            if isinstance(raw.get("answer"), str):
                answer_val = raw["answer"]
            if isinstance(raw.get("query"), str):
                query_val = raw["query"]
            rt = raw.get("response_time")
            if isinstance(rt, (int, float)):
                response_time_val = rt
            if isinstance(raw.get("images"), list):
                images_val = raw["images"]
        elif isinstance(raw, list):
            # Older/alternate shape directly returns a list
            for item in raw:
                if isinstance(item, dict):
                    normalized.append(
                        {
                            "title": item.get("title"),
                            "url": item.get("url"),
                            "score": item.get("score"),
                        }
                    )
                elif isinstance(item, str):
                    normalized.append({"title": item, "url": None, "score": None})
        elif isinstance(raw, str):
            normalized.append({"title": None, "url": None, "score": None})

        logger.info("Tavily normalized results=%d has_answer=%s", len(normalized), bool(answer_val))
        # Return the full Tavily payload with a normalized results list for consistency
        payload: Dict[str, Any] = dict(raw) if isinstance(raw, dict) else {}
        payload["results"] = normalized
        return payload
    except Exception as e:
        logger.exception("Tavily search failed")
        # Do not leak detailed error messages from provider
        msg = str(e).lower()
        code = "search_failed"
        if "unauthorized" in msg or "401" in msg:
            code = "tavily_unauthorized"
        elif "rate" in msg or "429" in msg or "limit" in msg:
            code = "tavily_rate_limited"
        elif "credit" in msg:
            code = "tavily_no_credits"
        return {"answer": None, "results": [], "error": code}


tools = [tavily_search]

