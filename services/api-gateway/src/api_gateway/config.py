from __future__ import annotations

from functools import lru_cache

from finsight_common.config import ServiceSettings


class Settings(ServiceSettings):
    service_name: str = "api-gateway"

    # Upstream service base URLs (overridable per environment).
    identity_url: str = "http://identity-service:8000"
    ingestion_url: str = "http://ingestion-service:8000"
    normalization_url: str = "http://normalization-service:8000"
    graph_url: str = "http://graph-service:8000"
    reconciliation_url: str = "http://reconciliation-service:8000"
    intelligence_url: str = "http://intelligence-service:8000"
    anomaly_url: str = "http://anomaly-service:8000"
    forecast_url: str = "http://forecast-service:8000"
    action_url: str = "http://action-service:8000"

    request_timeout_seconds: float = 30.0
    rate_limit_per_minute: int = 600

    @property
    def routes(self) -> list[tuple[str, str, str]]:
        """(path_prefix, upstream_url, openapi_tag) — order matters (longest first)."""
        return [
            ("/v1/auth", self.identity_url, "auth"),
            ("/v1/api-keys", self.identity_url, "api-keys"),
            ("/.well-known/jwks.json", self.identity_url, "auth"),
            ("/v1/data", self.ingestion_url, "ingestion"),
            ("/v1/transactions/understand", self.normalization_url, "normalization"),
            ("/v1/transactions/explain", self.intelligence_url, "intelligence"),
            ("/v1/financial/ask", self.intelligence_url, "intelligence"),
            ("/v1/graph", self.graph_url, "graph"),
            ("/v1/payments/match", self.reconciliation_url, "reconciliation"),
            ("/v1/reconciliation", self.reconciliation_url, "reconciliation"),
            ("/v1/anomalies", self.anomaly_url, "anomalies"),
            ("/v1/forecast", self.forecast_url, "forecast"),
            ("/v1/simulate", self.forecast_url, "forecast"),
            ("/v1/actions", self.action_url, "actions"),
        ]

    @property
    def openapi_sources(self) -> dict[str, str]:
        return {
            "identity": self.identity_url,
            "ingestion": self.ingestion_url,
            "normalization": self.normalization_url,
            "graph": self.graph_url,
            "reconciliation": self.reconciliation_url,
            "intelligence": self.intelligence_url,
            "anomaly": self.anomaly_url,
            "forecast": self.forecast_url,
            "action": self.action_url,
        }


@lru_cache
def get_settings() -> Settings:
    return Settings()
