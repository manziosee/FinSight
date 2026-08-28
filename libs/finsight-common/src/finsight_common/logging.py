"""Structured JSON logging with trace correlation and PII redaction."""

from __future__ import annotations

import logging
import re
from collections.abc import Iterable
from typing import Any

import structlog

# Keys whose values must never appear in logs, plus a loose PAN/e-mail scrub.
_SENSITIVE_KEYS = {
    "password",
    "secret",
    "token",
    "authorization",
    "api_key",
    "client_secret",
    "access_token",
    "refresh_token",
    "card_number",
    "pan",
    "cvv",
    "account_number",
    "iban",
}
_PAN_RE = re.compile(r"\b(?:\d[ -]?){13,19}\b")
_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")


def _redact(_logger: Any, _name: str, event_dict: dict[str, Any]) -> dict[str, Any]:
    for key in list(event_dict):
        if key.lower() in _SENSITIVE_KEYS:
            event_dict[key] = "***redacted***"
        elif isinstance(event_dict[key], str):
            value = _PAN_RE.sub("***pan***", event_dict[key])
            value = _EMAIL_RE.sub("***email***", value)
            event_dict[key] = value
    return event_dict


def _add_trace_context(_logger: Any, _name: str, event_dict: dict[str, Any]) -> dict[str, Any]:
    try:
        from opentelemetry import trace

        span = trace.get_current_span()
        ctx = span.get_span_context()
        if ctx and ctx.is_valid:
            event_dict["trace_id"] = format(ctx.trace_id, "032x")
            event_dict["span_id"] = format(ctx.span_id, "016x")
    except Exception:  # noqa: S110  # pragma: no cover - telemetry is optional
        pass
    return event_dict


def configure_logging(service_name: str, level: str = "INFO", *, json_output: bool = True) -> None:
    """Idempotently configure stdlib + structlog for the process."""

    timestamper = structlog.processors.TimeStamper(fmt="iso", utc=True)
    shared: Iterable[Any] = (
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        timestamper,
        _add_trace_context,
        _redact,
    )
    renderer = (
        structlog.processors.JSONRenderer()
        if json_output
        else structlog.dev.ConsoleRenderer(colors=True)
    )

    structlog.configure(
        processors=[*shared, structlog.processors.StackInfoRenderer(), renderer],
        wrapper_class=structlog.make_filtering_bound_logger(getattr(logging, level.upper(), 20)),
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )
    logging.basicConfig(format="%(message)s", level=level.upper())
    structlog.contextvars.bind_contextvars(service=service_name)


def get_logger(name: str | None = None) -> structlog.stdlib.BoundLogger:
    return structlog.get_logger(name)
