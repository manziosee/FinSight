"""Per-tenant entity resolution: collapse "ABC Ltd", "ABC LIMITED", "abc  ltd." into one
canonical entity so the graph and the matching engine see a single customer/vendor.

Strategy (cheap → precise):
1. exact canonical-key hit (normalised name),
2. token-set fuzzy match against existing entities for the tenant (>= threshold),
3. otherwise create a new canonical entity.
"""

from __future__ import annotations

import hashlib
import re

from rapidfuzz import fuzz, process
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from finsight_common.schemas import FinancialRecord
from normalization_service.models import CanonicalEntity

_FUZZY_THRESHOLD = 88.0


def _canonical_key(name: str) -> str:
    cleaned = re.sub(
        r"\b(ltd|limited|inc|incorporated|llc|plc|co|company|corp|corporation|sarl|sa|gmbh|"
        r"pvt|pty|enterprises?|holdings?|group|the)\b",
        "",
        name.lower(),
    )
    return re.sub(r"[^a-z0-9]", "", cleaned)


def _entity_id(tenant_id: str, key: str) -> str:
    return "ent_" + hashlib.sha256(f"{tenant_id}|{key}".encode()).hexdigest()[:24]


class EntityResolver:
    def __init__(self, session: AsyncSession, tenant_id: str) -> None:
        self._session = session
        self._tenant_id = tenant_id
        self._cache: dict[str, CanonicalEntity] = {}

    async def _load_tenant_entities(self) -> list[CanonicalEntity]:
        rows = (
            (
                await self._session.execute(
                    select(CanonicalEntity).where(CanonicalEntity.tenant_id == self._tenant_id)
                )
            )
            .scalars()
            .all()
        )
        return list(rows)

    async def resolve(self, raw_name: str, kind: str = "counterparty") -> CanonicalEntity:
        key = _canonical_key(raw_name)
        if not key:
            key = re.sub(r"[^a-z0-9]", "", raw_name.lower()) or "unknown"

        if key in self._cache:
            ent = self._cache[key]
        else:
            ent = await self._session.get(CanonicalEntity, _entity_id(self._tenant_id, key))

        if ent is None:
            candidates = await self._load_tenant_entities()
            match = process.extractOne(
                key,
                {c.canonical_key: c for c in candidates}.keys(),
                scorer=fuzz.token_set_ratio,
                score_cutoff=_FUZZY_THRESHOLD,
            )
            if match:
                ent = next(c for c in candidates if c.canonical_key == match[0])

        if ent is None:
            ent = CanonicalEntity(
                id=_entity_id(self._tenant_id, key),
                tenant_id=self._tenant_id,
                canonical_key=key,
                display_name=raw_name.strip(),
                kind=kind,
                aliases=[raw_name.strip()],
            )
            self._session.add(ent)
        else:
            if raw_name.strip() and raw_name.strip() not in (ent.aliases or []):
                ent.aliases = [*(ent.aliases or []), raw_name.strip()]
            ent.seen_count = (ent.seen_count or 0) + 1

        self._cache[key] = ent
        return ent

    async def apply(self, records: list[FinancialRecord]) -> None:
        """Stamp each record's counterparty with its canonical id + display name."""
        for rec in records:
            if rec.counterparty and rec.counterparty.name:
                ent = await self.resolve(rec.counterparty.name)
                rec.counterparty.external_id = ent.id
                rec.counterparty.normalized_name = ent.canonical_key
                rec.counterparty.name = ent.display_name
        await self._session.flush()
