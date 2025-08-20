import os
import hmac
import hashlib
import time
from typing import Optional

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from brain.context import (
    model_base_url_var,
    model_api_key_var,
    model_name_var,
    tavily_key_var,
)
from brain.logger import get_logger


PROXY_SHARED_SECRET = os.getenv("PROXY_SHARED_SECRET", "")


class ProxyAuthAndModelMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        logger = get_logger("middleware.proxy")
        logger.debug(
            "auth_check_start path=%s method=%s has_sig=%s",
            request.url.path,
            request.method,
            bool(request.headers.get("x-proxy-signature")),
        )
        # Verify server-to-server signature when a secret is configured
        if PROXY_SHARED_SECRET:
            ok = await _verify_signature(request, PROXY_SHARED_SECRET, logger)
            if not ok:
                logger.warning("auth_check_failed path=%s", request.url.path)
                return Response(status_code=401)

        # Extract per-request overrides provided by the trusted proxy
        try:
            model_base_url_var.set(_safe_header(request, "x-openai-base-url"))
            model_api_key_var.set(_safe_header(request, "x-openai-api-key"))
            model_name_var.set(_safe_header(request, "x-openai-model"))
            tavily_key_var.set(_safe_header(request, "x-tavily-api-key"))
            # Safe diagnostic log (no secrets)
            base_url = model_base_url_var.get()
            base_host = None
            if base_url:
                try:
                    from urllib.parse import urlparse
                    base_host = urlparse(base_url).hostname
                except Exception:
                    base_host = "invalid-url"
            logger.debug(
                "config_received path=%s base_host=%s model=%s has_api_key=%s has_tavily=%s",
                request.url.path,
                base_host,
                model_name_var.get(),
                bool(model_api_key_var.get()),
                bool(tavily_key_var.get()),
            )
        except Exception:
            # Do not fail the request if headers are missing; defaults will be used
            pass

        response = await call_next(request)
        return response


def _safe_header(request: Request, key: str) -> Optional[str]:
    val = request.headers.get(key)
    if not isinstance(val, str):
        return None
    s = val.strip()
    return s or None


async def _verify_signature(request: Request, secret: str, logger) -> bool:
    try:
        sig = request.headers.get("x-proxy-signature")
        sent_at = request.headers.get("x-sent-at")
        nonce = request.headers.get("x-nonce")
        if not sig or not sent_at or not nonce:
            logger.debug("sig_missing sig=%s sent_at=%s nonce=%s", bool(sig), bool(sent_at), bool(nonce))
            return False
        ts = int(sent_at)
        # 60s tolerance window
        if abs(int(time.time()) - ts) > 60:
            logger.debug("sig_ts_skew now=%s sent_at=%s", int(time.time()), ts)
            return False
        body = await request.body()
        body_hash = hashlib.sha256(body).hexdigest()
        msg = f"{request.method}|{request.url.path}|{ts}|{nonce}|{body_hash}".encode()
        expected = hmac.new(secret.encode(), msg, hashlib.sha256).hexdigest()
        ok = hmac.compare_digest(expected, sig)
        if not ok:
            logger.debug("sig_mismatch path=%s body_hash=%s", request.url.path, body_hash)
        return ok
    except Exception:
        return False


