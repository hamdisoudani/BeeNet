from __future__ import annotations

import logging
import os
from typing import Optional


def get_logger(component_name: str, level: Optional[str] = None) -> logging.Logger:
    """Create or retrieve a namespaced logger with consistent formatting.

    Handlers are attached only once per logger to avoid duplicate logs.
    """

    logger_name = f"beenet.{component_name}"
    logger = logging.getLogger(logger_name)
    if logger.handlers:
        return logger

    log_level_str = (level or os.getenv("LOG_LEVEL", "INFO")).upper()
    log_level = getattr(logging, log_level_str, logging.INFO)

    handler = logging.StreamHandler()
    formatter = logging.Formatter(
        fmt="%(asctime)s %(levelname)s [%(name)s] %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S%z",
    )
    handler.setFormatter(formatter)

    logger.addHandler(handler)
    logger.setLevel(log_level)
    logger.propagate = False
    return logger


