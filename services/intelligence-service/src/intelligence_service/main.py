from __future__ import annotations

import os

from fastapi import Depends
from pydantic import BaseModel, Field

from finsight_common.app import create_app
from finsight_common.auth import require_scopes
from finsight_common.config import ServiceSettings
from intelligence_service import __version__
from intelligence_service.llm import get_provider

settings = ServiceSettings(service_name="intelligence-service")
provider = get_provider(
    name=os.getenv("FINSIGHT_LLM_PROVIDER", "anthropic"),
    model=os.getenv("FINSIGHT_LLM_MODEL", "claude-sonnet-5"),
)

app = create_app(
    settings=settings,
    version=__version__,
    title="FinSight Intelligence Service",
    description=(
        "Understands, explains and answers questions about financial data. "
        "STATUS: scaffold — endpoints return provider output plus a stub evidence block."
    ),
)

_SYSTEM = (
    "You are FinSight's financial analyst. Given structured, pre-redacted financial "
    "context, explain clearly and cite the numbers you used. Never invent figures."
)


class ExplainRequest(BaseModel):
    subject: str = Field(examples=["transaction txn_9281"])
    context: dict = Field(default_factory=dict)


class AskRequest(BaseModel):
    question: str = Field(examples=["Which customers consistently pay late?"])
    context: dict = Field(default_factory=dict)


class Answer(BaseModel):
    answer: str
    evidence: list[str] = Field(default_factory=list)
    confidence: float = 0.4
    disclaimer: str = "Scaffold response — wire real financial context before production use."


@app.post("/v1/transactions/explain", response_model=Answer, tags=["intelligence"])
async def explain(body: ExplainRequest, _=Depends(require_scopes("transactions:read"))) -> Answer:
    text = await provider.complete(_SYSTEM, f"Explain {body.subject}. Context: {body.context}")
    return Answer(answer=text, evidence=[f"context keys: {sorted(body.context)}"])


@app.post("/v1/financial/ask", response_model=Answer, tags=["intelligence"])
async def ask(body: AskRequest, _=Depends(require_scopes("financial:ask"))) -> Answer:
    text = await provider.complete(_SYSTEM, f"Question: {body.question}\nContext: {body.context}")
    return Answer(answer=text, evidence=[f"context keys: {sorted(body.context)}"])
