from anomaly_service.main import app
from fastapi.testclient import TestClient

from finsight_common import auth


async def _fake_principal() -> auth.Principal:
    return auth.Principal(subject="t", tenant_id="t1", scopes={"anomalies:read"})


def test_detect_flags_outlier_and_duplicate() -> None:
    app.dependency_overrides[auth.get_principal] = _fake_principal
    client = TestClient(app)

    txns = [
        {"id": f"n{i}", "amount_minor": 1000, "counterparty": "x", "reference": f"r{i}"}
        for i in range(8)
    ]
    txns.append({"id": "dup", "amount_minor": 1000, "counterparty": "x", "reference": "r0"})
    txns.append({"id": "big", "amount_minor": 500_000, "counterparty": "z", "reference": "r99"})
    body = {"transactions": txns, "z_threshold": 1.5}
    r = client.post("/v1/anomalies/detect", json=body)
    assert r.status_code == 200
    rules = {f["rule"] for f in r.json()}
    assert "duplicate_payment" in rules
    assert "amount_zscore" in rules
    app.dependency_overrides.clear()
