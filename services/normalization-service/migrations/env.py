import os

from finsight_common.alembic_env import run

_DSN_ENV = {
    "identity_service": "FINSIGHT_IDENTITY_DB_DSN",
    "ingestion_service": "FINSIGHT_INGESTION_DB_DSN",
    "normalization_service": "FINSIGHT_NORMALIZATION_DB_DSN",
    "reconciliation_service": "FINSIGHT_RECONCILIATION_DB_DSN",
}["normalization_service"]

run(
    dsn=os.environ.get(
        _DSN_ENV,
        "postgresql+asyncpg://finsight:finsight_local_pw@localhost:5432/normalization_service",
    ),
    target_metadata_modules=[
        "finsight_common.messaging.outbox_sql",
        "normalization_service.models",
    ],
)
