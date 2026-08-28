from __future__ import annotations

import datetime as dt

from fastapi import Depends
from pydantic import BaseModel, Field

from finsight_common.app import create_app
from finsight_common.auth import require_scopes
from finsight_common.config import ServiceSettings
from forecast_service import __version__

app = create_app(
    settings=ServiceSettings(service_name="forecast-service"),
    version=__version__,
    title="FinSight Forecast Service",
    description=(
        "Cash-flow forecasting and scenario simulation. "
        "STATUS: scaffold — naive linear projection; replace with a real model."
    ),
)


class ForecastRequest(BaseModel):
    opening_balance_minor: int
    horizon_days: int = Field(default=30, ge=1, le=365)
    expected_inflows_minor: int = 0
    expected_outflows_minor: int = 0
    currency: str = "USD"


class ForecastPoint(BaseModel):
    date: dt.date
    projected_balance_minor: int


class ForecastResponse(BaseModel):
    currency: str
    points: list[ForecastPoint]
    risk: str
    status: str = "scaffold"


@app.post("/v1/forecast", response_model=ForecastResponse, tags=["forecast"])
async def forecast(
    body: ForecastRequest, _=Depends(require_scopes("forecast:run"))
) -> ForecastResponse:
    daily_delta = (body.expected_inflows_minor - body.expected_outflows_minor) // body.horizon_days
    today = dt.date.today()
    balance = body.opening_balance_minor
    points: list[ForecastPoint] = []
    for day in range(1, body.horizon_days + 1):
        balance += daily_delta
        points.append(
            ForecastPoint(date=today + dt.timedelta(days=day), projected_balance_minor=balance)
        )
    risk = "high" if any(p.projected_balance_minor < 0 for p in points) else "low"
    return ForecastResponse(currency=body.currency, points=points, risk=risk)


@app.post("/v1/simulate", tags=["forecast"])
async def simulate(scenario: dict, _=Depends(require_scopes("forecast:run"))) -> dict:
    return {
        "scenario": scenario,
        "impact": "not-yet-modelled",
        "status": "scaffold",
        "note": "Wire salary/tax/opex models per docs/adr before use.",
    }
