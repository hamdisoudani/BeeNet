from contextvars import ContextVar
from typing import Optional

# Per-request context propagated by FastAPI middleware
model_base_url_var: ContextVar[Optional[str]] = ContextVar("model_base_url", default=None)
model_api_key_var: ContextVar[Optional[str]] = ContextVar("model_api_key", default=None)
model_name_var: ContextVar[Optional[str]] = ContextVar("model_name", default=None)
serper_key_var: ContextVar[Optional[str]] = ContextVar("serper_api_key", default=None)

def get_model_base_url() -> Optional[str]:
    return model_base_url_var.get()

def get_model_api_key() -> Optional[str]:
    return model_api_key_var.get()

def get_model_name() -> Optional[str]:
    return model_name_var.get()

def get_serper_api_key() -> Optional[str]:
    return serper_key_var.get()

# Note: thread id is controlled by CopilotKit; we intentionally do not set/read it here


