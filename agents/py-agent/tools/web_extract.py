from langchain_core.tools import tool
from typing import List, Dict, Any
from brain.logger import get_logger
import os
import requests
from brain.context import get_serper_api_key


@tool
def serper_scrape(
    urls: List[str],
) -> Dict[str, Any]:
    """
    Extract raw textual content for one or more URLs using Serper Scrape.

    Returns a dict with minimal, normalized fields:
    - results: list[{ url, raw_content, favicon? }]
    - failed_results: list[{ url, error }]
    """
    logger = get_logger("tools.serper_scrape")

    # Sanitize inputs
    safe_urls: List[str] = []
    try:
        for u in urls or []:
            if not isinstance(u, str):
                continue
            su = u.strip()
            if not su:
                continue
            # Skip common non-text types early
            lu = su.lower()
            from urllib.parse import urlparse
            host = urlparse(lu).hostname or ""
            if any(d in host for d in ("youtube.com", "youtu.be")):
                continue
            banned_ext = (".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg")
            if any(lu.endswith(ext) for ext in banned_ext):
                continue
            safe_urls.append(su)
    except Exception:
        pass

    if not safe_urls:
        return {"results": [], "failed_results": []}

    api_key = get_serper_api_key() or os.getenv("SERPER_API_KEY", "")
    if not api_key:
        return {"results": [], "failed_results": [{"url": None, "error": "serper_missing_key"}]}

    headers = {"X-API-KEY": api_key, "Content-Type": "application/json"}
    norm_results: List[Dict[str, Any]] = []
    norm_failed: List[Dict[str, Any]] = []
    for url in safe_urls:
        try:
            resp = requests.post("https://google.serper.dev/scrape", headers=headers, json={"url": url}, timeout=15)
            if resp.status_code == 401:
                norm_failed.append({"url": url, "error": "serper_unauthorized"})
                continue
            if resp.status_code == 402:
                norm_failed.append({"url": url, "error": "serper_payment_required"})
                continue
            if resp.status_code == 429:
                norm_failed.append({"url": url, "error": "serper_rate_limited"})
                continue
            if not resp.ok:
                norm_failed.append({"url": url, "error": f"provider_error_{resp.status_code}"})
                continue
            data = resp.json() if resp.content else {}
            # Serper scrape returns fields like 'markdown', 'text', or 'content'. Prefer markdown/text.
            raw_content = None
            if isinstance(data, dict):
                raw_content = data.get("markdown") or data.get("text") or data.get("content")
            if isinstance(raw_content, str) and raw_content.strip():
                fav = None
                try:
                    from urllib.parse import urlparse
                    host = urlparse(url).hostname
                    if host:
                        fav = f"https://www.google.com/s2/favicons?domain={host}&sz=64"
                except Exception:
                    fav = None
                out: Dict[str, Any] = {"url": url, "raw_content": raw_content}
                if fav:
                    out["favicon"] = fav
                norm_results.append(out)
            else:
                norm_failed.append({"url": url, "error": "empty_content"})
        except Exception:
            norm_failed.append({"url": url, "error": "extract_failed"})

    logger.info("Serper scrape results=%d failed=%d", len(norm_results), len(norm_failed))
    return {"results": norm_results, "failed_results": norm_failed}


