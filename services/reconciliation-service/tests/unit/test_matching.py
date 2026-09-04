from reconciliation_service.matching import Candidate, best_matches, reconcile, score


def _pay(id_, amount, ref=None, cp=None, day=0.0):
    return Candidate(
        id=id_,
        amount_minor=amount,
        currency="RWF",
        reference=ref,
        counterparty=cp,
        occurred_at_days=day,
    )


def _inv(id_, amount, ref=None, cp=None, day=0.0, open_=None):
    return Candidate(
        id=id_,
        amount_minor=amount,
        currency="RWF",
        reference=ref,
        counterparty=cp,
        occurred_at_days=day,
        open_minor=open_,
    )


def test_exact_match_scores_high_with_explanation() -> None:
    result = score(
        _pay("p", 85_000_00, "INV-439", "abc", 100), _inv("i", 85_000_00, "INV-439", "abc", 95)
    )
    assert result.confidence > 0.9
    assert "exact amount" in result.explanation
    assert "INV-439" in result.explanation
    assert result.match_type == "exact"


def test_greedy_assignment_is_one_to_one() -> None:
    pairs = best_matches(
        [_pay("p1", 1000, "INV-1"), _pay("p2", 2000, "INV-2")],
        [_inv("i1", 1000, "INV-1"), _inv("i2", 2000, "INV-2")],
        threshold=0.6,
    )
    assert {(p, i) for p, i, _ in pairs} == {("p1", "i1"), ("p2", "i2")}


def test_unrelated_amounts_are_not_called_partial() -> None:
    assert best_matches([_pay("p1", 999, "ZZZ")], [_inv("i1", 5000, "QQQ")], threshold=0.6) == []


def test_partial_payment_keeps_invoice_open_with_reason() -> None:
    res = reconcile(
        [_pay("p1", 400_00, "INV-9", "acme ltd", 10)],
        [_inv("i1", 1000_00, "INV-9", "acme ltd", 5)],
        threshold=0.6,
    )
    assert res.matches and res.matches[0][2].match_type == "partial"
    assert res.matches[0][2].residual_minor == 600_00
    assert any("open" in reason for _, reason in res.unmatched_invoices)


def test_split_payment_settles_multiple_invoices() -> None:
    res = reconcile(
        [_pay("p1", 300_00, cp="kigali foods", day=20)],
        [
            _inv("i1", 100_00, "INV-1", "kigali foods", 5),
            _inv("i2", 200_00, "INV-2", "kigali foods", 6),
            _inv("i3", 999_00, "INV-3", "other co", 7),
        ],
        threshold=0.6,
    )
    split = [m for m in res.matches if m[2].match_type == "split"]
    assert split and set(split[0][1]) == {"i1", "i2"}


def test_unmatched_payment_reason_is_specific() -> None:
    res = reconcile(
        [_pay("p1", 500_00, "INV-777", "ghost co")],
        [_inv("i1", 500_00, "INV-1", "acme")],
        threshold=0.6,
    )
    reason = dict(res.unmatched_payments)["p1"]
    assert "INV-777" in reason or "counterparty" in reason
