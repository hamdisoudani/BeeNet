import os
from langchain_openai import ChatOpenAI
from typing import Optional, Dict
from brain.context import (
    get_model_base_url,
    get_model_api_key,
    get_model_name,
)


def _resolve_from_headers(config: Optional[Dict]) -> Dict[str, str]:
    """Resolve model config from request headers via LangChain RunnableConfig (if available).
    Expects headers set by the NestJS proxy: x-openai-base-url, x-openai-api-key, x-openai-model.
    """
    try:
        headers = (config or {}).get("configurable", {}).get("headers", {})
        base_url = headers.get("x-openai-base-url") or None
        api_key = headers.get("x-openai-api-key") or None
        model = headers.get("x-openai-model") or None
        return {"base_url": base_url, "api_key": api_key, "model": model}
    except Exception:
        return {"base_url": None, "api_key": None, "model": None}


def get_model(config: Optional[Dict] = None):
    # Priority: per-request context (set by middleware) > config headers > env
    base_url = get_model_base_url() or _resolve_from_headers(config).get("base_url") or os.getenv("MAIN_MODEL_BASE_URL", "https://integrate.api.nvidia.com/v1")
    api_key = get_model_api_key() or _resolve_from_headers(config).get("api_key") or os.getenv("MAIN_MODEL_API_KEY", "")
    model = get_model_name() or _resolve_from_headers(config).get("model") or os.getenv("MAIN_MODEL_NAME", "openai/gpt-oss-20b")
    return ChatOpenAI(base_url=base_url, api_key=api_key, model=model)


def get_planner_model(config: Optional[Dict] = None):
    """Lightweight model dedicated for planning/routing."""
    headers = _resolve_from_headers(config)
    base_url = get_model_base_url() or headers.get("base_url") or os.getenv("PLANNER_MODEL_BASE_URL", os.getenv("MAIN_MODEL_BASE_URL", "https://api.synthetic.new/v1"))
    api_key = get_model_api_key() or headers.get("api_key") or os.getenv("PLANNER_MODEL_API_KEY", os.getenv("MAIN_MODEL_API_KEY", ""))
    model = get_model_name() or headers.get("model") or os.getenv("PLANNER_MODEL_NAME", "hf:Qwen/Qwen2.5-7B-Instruct")
    return ChatOpenAI(base_url=base_url, api_key=api_key, model=model)