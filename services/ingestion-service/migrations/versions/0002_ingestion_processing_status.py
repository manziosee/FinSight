"""store normalization results on ingestion batches

Revision ID: 0002_ingestion_processing_status
Revises: 0001_initial
"""

import sqlalchemy as sa
from alembic import op

revision = "0002_ingestion_processing_status"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    columns = {column["name"] for column in sa.inspect(bind).get_columns("ingestions")}
    additions = (
        (
            "record_count",
            sa.Column("record_count", sa.Integer(), nullable=False, server_default="0"),
        ),
        (
            "warnings",
            sa.Column("warnings", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        ),
        ("error_summary", sa.Column("error_summary", sa.String(1000), nullable=True)),
        ("completed_at", sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True)),
    )
    for name, column in additions:
        if name not in columns:
            op.add_column("ingestions", column)


def downgrade() -> None:
    bind = op.get_bind()
    columns = {column["name"] for column in sa.inspect(bind).get_columns("ingestions")}
    for name in ("completed_at", "error_summary", "warnings", "record_count"):
        if name in columns:
            op.drop_column("ingestions", name)
