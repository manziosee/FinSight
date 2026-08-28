"""OpenTelemetry tracing/metrics wiring. No-op when no OTLP endpoint is configured."""

from __future__ import annotations

from typing import TYPE_CHECKING

from finsight_common.logging import get_logger

if TYPE_CHECKING:
    from fastapi import FastAPI

_log = get_logger(__name__)


def configure_telemetry(app: FastAPI, service_name: str, otlp_endpoint: str | None) -> None:
    """Instrument a FastAPI app for traces. Safe to call without a collector."""

    if not otlp_endpoint:
        _log.info("telemetry.disabled", reason="no otlp endpoint")
        return

    try:
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
        from opentelemetry.sdk.resources import SERVICE_NAME, Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor

        provider = TracerProvider(resource=Resource.create({SERVICE_NAME: service_name}))
        provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint=otlp_endpoint)))
        trace.set_tracer_provider(provider)

        FastAPIInstrumentor.instrument_app(app, tracer_provider=provider)
        HTTPXClientInstrumentor().instrument(tracer_provider=provider)
        _log.info("telemetry.enabled", endpoint=otlp_endpoint)
    except Exception as exc:  # pragma: no cover - defensive
        _log.warning("telemetry.setup_failed", error=str(exc))
