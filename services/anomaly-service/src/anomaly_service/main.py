from __future__ import annotations

import statistics

from fastapi import Depends
from pydantic import BaseModel, Field

from anomaly_service import __version__
from finsight_common.app import create_app
from finsight_common.auth import require_scopes
from finsight_common.config import ServiceSettings

app = create_app(
    settings=ServiceSettings(service_name="anomaly-service"),
    version=__version__,
    title="FinSight Anomaly Service",
    description=(
        "Rule + statistical anomaly detection over financial records. "
        "STATUS: scaffold — z-score + duplicate rules implemented; ML models TODO."
    ),
)


class Txn(BaseModel):
    id: str
    amount_minor: int
    currency: str = "USD"
    counterparty: str | None = None
    reference: str | None = None


class DetectRequest(BaseModel):
    transactions: list[Txn] = Field(min_length=1)
    z_threshold: float = 3.0


class Finding(BaseModel):
    record_id: str
    rule: str
    severity: str
    score: float
    explanation: str


@app.post("/v1/anomalies/detect", response_model=list[Finding], tags=["anomalies"])
async def detect(body: DetectRequest, _=Depends(require_scopes("anomalies:read"))) -> list[Finding]:
    txns = body.transactions
    findings: list[Finding] = []

    amounts = [t.amount_minor for t in txns]
    if len(amounts) >= 3:
        mean = statistics.fmean(amounts)
        stdev = statistics.pstdev(amounts) or 1.0
        for t in txns:
            z = abs(t.amount_minor - mean) / stdev
            if z >= body.z_threshold:
                findings.append(
                    Finding(
                        record_id=t.id,
                        rule="amount_zscore",
                        severity="high" if z > 5 else "medium",
                        score=round(z, 2),
                        explanation=(
                            f"Amount {t.amount_minor} is {z:.1f} std devs "
                            f"from the batch mean {mean:.0f}."
                        ),
                    )
                )

    seen: dict[tuple, str] = {}
    for t in txns:
        key = (t.amount_minor, t.currency, t.counterparty, t.reference)
        if key in seen:
            findings.append(
                Finding(
                    record_id=t.id,
                    rule="duplicate_payment",
                    severity="high",
                    score=0.95,
                    explanation=f"Identical amount/counterparty/reference as {seen[key]}.",
                )
            )
        else:
            seen[key] = t.id

    return findings


@app.post("/v1/anomalies/explain", tags=["anomalies"])
async def explain(finding: Finding, _=Depends(require_scopes("anomalies:read"))) -> dict:
    return {
        "record_id": finding.record_id,
        "rule": finding.rule,
        "narrative": finding.explanation,
        "recommended_action": "review_manually",
        "status": "scaffold",
    }
