from __future__ import annotations

from fastapi import Depends, Request
from pydantic import BaseModel, Field

from finsight_common.app import create_app
from finsight_common.auth import Principal, require_scopes
from finsight_common.errors import NotFoundError
from intelligence_service import __version__
from intelligence_service.config import get_settings
from intelligence_service.evidence import EvidenceClient
from intelligence_service.llm import get_provider

settings = get_settings()
provider = get_provider(name=settings.llm_provider, model=settings.llm_model)
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
    "You are FinSight's financial analyst. You are given a JSON 'evidence' object containing "
    "real figures from the company's reconciliation and graph data, already redacted of PII. "
    "Answer using ONLY the numbers in evidence — never invent a figure. If evidence is "
    "insufficient to answer, say so plainly. Cite the specific evidence fields you used. "
    "Keep the answer under 150 words; be direct and concrete."
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
        match_ev = await evidence.match_context(body.run_id, body.match_id, _auth_header(request))
        gathered["match"] = match_ev
        grounded = bool(match_ev.get("found"))
        if not match_ev.get("found"):
            raise NotFoundError(
                f"no match or unmatched record '{body.match_id}' in run '{body.run_id}'"
            )

    text = await provider.complete(_SYSTEM, f"Explain: {body.subject}\n\nEvidence:\n{gathered}")
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
    summary = await evidence.reconciliation_summary(_auth_header(request))
    gathered = {"reconciliation_summary": summary, **body.context}
    grounded = bool(summary.get("has_data"))

    text = await provider.complete(_SYSTEM, f"Question: {body.question}\n\nEvidence:\n{gathered}")
    return Answer(
        answer=text,
        evidence=gathered,
        confidence=0.8 if grounded else 0.3,
        grounded=grounded,
    )
