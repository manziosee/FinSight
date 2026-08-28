"""initial schema (bootstrapped from ORM models)

Revision ID: 0001_initial
Revises:
Create Date: 2026-08-28

NOTE: This first migration materialises the current ORM models in one step so a
fresh environment can be stood up. Subsequent changes MUST use explicit
op.* operations generated with `alembic revision --autogenerate`.
"""

from alembic import op

from finsight_common.db import Base
from finsight_common.messaging import outbox_sql  # noqa: F401  (registers outbox table)
from normalization_service import models  # noqa: F401  (registers service tables)

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    Base.metadata.create_all(op.get_bind())


def downgrade() -> None:
    Base.metadata.drop_all(op.get_bind())
