from __future__ import annotations

import json

from fastapi import Depends, Request
from pydantic import BaseModel, Field

from finsight_common.app import create_app
from finsight_common.auth import Principal, require_scopes
from finsight_common.errors import NotFoundError
from intelligence_service import __version__
from intelligence_service.config import get_settings
from intelligence_service.evidence import EvidenceClient, financial_snapshot, match_snapshot
from intelligence_service.llm import get_provider

settings = get_settings()
provider = get_provider(
    name=settings.llm_provider, model=settings.llm_model or None, base_url=settings.llm_base_url
)
evidence = EvidenceClient(settings.reconciliation_url, settings.graph_url)

app = create_app(
    settings=settings,
    version=__version__,
    title="FinSight Intelligence Service",
    description=(
        "Understands, explains and answers questions about financial data. Every answer "
        "is grounded in evidence pulled live from reconciliation-service / graph-service — "
        "the model narrates numbers, it never invents them."
    ),
)

_SYSTEM = (
    "You are FinSight's assistant for finance teams. You receive an 'evidence' object with "
    "real figures from the company's reconciliation and financial graph (PII removed). "
    "Rules: use ONLY figures in evidence and never invent one; if evidence cannot answer, "
    "say what is missing in one sentence and suggest what to upload or run. Write for a "
    "business reader: amounts with their currency exactly as given, customer names, dates "
    "and invoice references. Never show record IDs, run IDs, match IDs, field names, JSON, "
    "code formatting or the words 'minor units'. No preamble and no bracketed citations. "
    "Lead with the direct answer in one sentence, then up to 4 short Markdown bullets. "
    "Keep it under 120 words."
)


def _auth_header(request: Request) -> str | None:
    return request.headers.get("authorization")


class ExplainRequest(BaseModel):
    subject: str = Field(examples=["match m_123 in run r_456"])
    run_id: str | None = Field(default=None, description="Reconciliation run to pull evidence from")
    match_id: str | None = Field(
        default=None, description="Match or unmatched record id within that run"
    )
    context: dict = Field(default_factory=dict, description="Extra evidence supplied by the caller")


class AskRequest(BaseModel):
    question: str = Field(examples=["Which invoices are still open?"])
    context: dict = Field(default_factory=dict)


class Answer(BaseModel):
    answer: str
    evidence: dict
    confidence: float
    grounded: bool = Field(
        description="True if evidence came from live service data, not just caller input"
    )


@app.post("/v1/transactions/explain", response_model=Answer, tags=["intelligence"])
async def explain(
    body: ExplainRequest,
    request: Request,
    _: Principal = Depends(require_scopes("transactions:read")),
) -> Answer:
    grounded = False
    gathered: dict = dict(body.context)
    if body.run_id and body.match_id:
        match_ev = await match_snapshot(evidence, body.run_id, body.match_id, _auth_header(request))
        gathered["match"] = match_ev
        grounded = bool(match_ev.get("found"))
        if not match_ev.get("found"):
            raise NotFoundError(
                f"no match or unmatched record '{body.match_id}' in run '{body.run_id}'"
            )

    task = (
        "Explain to the reviewer why this payment was or wasn't matched, whether it looks "
        "right, and what they should do next."
        if grounded
        else f"Explain: {body.subject}"
    )
    text = await provider.complete(_SYSTEM, f"{task}\n\nEvidence:\n{json.dumps(gathered)}")
    return Answer(
        answer=text,
        evidence=gathered,
        confidence=0.85 if grounded else 0.35,
        grounded=grounded,
    )


@app.post("/v1/financial/ask", response_model=Answer, tags=["intelligence"])
async def ask(
    body: AskRequest,
    request: Request,
    _: Principal = Depends(require_scopes("financial:ask")),
) -> Answer:
    snapshot = await financial_snapshot(evidence, _auth_header(request))
    gathered = {"finances": snapshot, **body.context}
    grounded = bool(snapshot.get("has_data"))

    text = await provider.complete(
        _SYSTEM, f"Question: {body.question}\n\nEvidence:\n{json.dumps(gathered)}"
    )
    return Answer(
        answer=text,
        evidence=gathered,
        confidence=0.8 if grounded else 0.3,
        grounded=grounded,
    )
