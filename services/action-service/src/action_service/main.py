from __future__ import annotations

import uuid

from fastapi import Depends
from pydantic import BaseModel, Field

from action_service import __version__
from finsight_common.app import create_app
from finsight_common.auth import require_scopes
from finsight_common.config import ServiceSettings

app = create_app(
    settings=ServiceSettings(service_name="action-service"),
    version=__version__,
    title="FinSight Action Service",
    description=(
        "Approval-gated execution of financial actions and the tool surface for AI agents. "
        "STATUS: scaffold — actions are recorded as 'pending_approval', never executed."
    ),
)

# The catalog an AI agent can discover (MCP-style). Execution is intentionally stubbed.
ACTION_CATALOG = {
    "send_payment_reminder": {"scopes": ["actions:execute"], "requires_approval": True},
    "mark_invoice_paid": {"scopes": ["actions:execute"], "requires_approval": True},
    "create_reconciliation_run": {"scopes": ["reconciliation:run"], "requires_approval": False},
    "flag_transaction": {"scopes": ["anomalies:read"], "requires_approval": False},
}


class ActionRequest(BaseModel):
    action: str = Field(examples=["send_payment_reminder"])
    params: dict = Field(default_factory=dict)
    dry_run: bool = True


class ActionResult(BaseModel):
    action_id: str
    action: str
    status: str
    requires_approval: bool
    detail: str


@app.get("/v1/actions/catalog", tags=["actions"])
async def catalog(_=Depends(require_scopes("actions:execute"))) -> dict:
    return ACTION_CATALOG


@app.post("/v1/actions/execute", response_model=ActionResult, tags=["actions"])
async def execute(
    body: ActionRequest, _=Depends(require_scopes("actions:execute"))
) -> ActionResult:
    spec = ACTION_CATALOG.get(body.action)
    if spec is None:
        from finsight_common.errors import NotFoundError

        raise NotFoundError(f"unknown action '{body.action}'")
    return ActionResult(
        action_id=str(uuid.uuid4()),
        action=body.action,
        status="pending_approval" if spec["requires_approval"] else "queued",
        requires_approval=bool(spec["requires_approval"]),
        detail="Scaffold: action captured but not executed. Wire the workflow engine to enable.",
    )
