from langchain_core.tools import tool
from typing import List, Dict, Any
from brain.logger import get_logger
import os
import re
import requests
from brain.context import get_serper_api_key


@tool
def serper_search(
    query: str,
    num: int = 10,
    gl: str = "us",
    hl: str = "en",
    autocorrect: bool = True,
) -> Dict[str, Any]:
    """
    Search the web using Serper and return a dict with:
    - results: list[{title, url, favicon?}] (ordered by position as returned)
    Accepts params similar to Serper: q, num, gl, hl, autocorrect
    """
    logger = get_logger("tools.serper_search")
    try:
        safe_query = str(query or "").strip()
        safe_query = re.sub(r"\s+", " ", safe_query)[:512]
        safe_num = max(1, min(int(num or 10), int(os.getenv("SERPER_MAX_RESULTS", "10"))))

        api_key = get_serper_api_key() or os.getenv("SERPER_API_KEY", "")
        if not api_key:
            return {"results": [], "error": "serper_missing_key"}
        headers = {"X-API-KEY": api_key, "Content-Type": "application/json"}
        body: Dict[str, Any] = {"q": safe_query, "num": safe_num, "gl": gl, "hl": hl, "autocorrect": bool(autocorrect)}
        resp = requests.post("https://google.serper.dev/search", headers=headers, json=body, timeout=12)
        if resp.status_code == 401:
            return {"results": [], "error": "serper_unauthorized"}
        if resp.status_code == 402:
            return {"results": [], "error": "serper_payment_required"}
        if resp.status_code == 429:
            return {"results": [], "error": "serper_rate_limited"}
        if not resp.ok:
            return {"results": [], "error": f"provider_error_{resp.status_code}"}
        data = resp.json() if resp.content else {}
        organic = data.get("organic") if isinstance(data, dict) else None
        results: List[Dict[str, Any]] = []
        if isinstance(organic, list):
            for item in organic:
                if isinstance(item, dict):
                    title = item.get("title")
                    url = item.get("link") or item.get("url")
                    if not isinstance(url, str):
                        continue
                    fav = None
                    try:
                        from urllib.parse import urlparse
                        host = urlparse(url).hostname
                        if host:
                            fav = f"https://www.google.com/s2/favicons?domain={host}&sz=64"
                    except Exception:
                        fav = None
                    results.append({
                        "title": title,
                        "url": url,
                        "favicon": fav,
                        "position": item.get("position"),
                        "snippet": item.get("snippet"),
                    })
        return {"results": results}
    except Exception as e:
        logger.exception("Serper search failed")
        return {"results": [], "error": "search_failed"}


tools = [serper_search]

