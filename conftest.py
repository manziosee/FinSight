"""Repo-wide test bootstrap: force offline, disable telemetry, use ephemeral SQLite."""

import os

os.environ.setdefault("FINSIGHT_ENV", "test")
os.environ["FINSIGHT_OTEL_EXPORTER_OTLP_ENDPOINT"] = ""
os.environ.setdefault("FINSIGHT_LLM_PROVIDER", "echo")
os.environ.setdefault("FINSIGHT_KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
