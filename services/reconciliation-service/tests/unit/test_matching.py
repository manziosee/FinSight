from reconciliation_service.matching import Candidate, best_matches, score


def _c(id_, amount, ref=None, cp=None, day=0.0):
    return Candidate(
        id=id_,
        amount_minor=amount,
        currency="RWF",
        reference=ref,
        counterparty=cp,
        occurred_at_days=day,
    )


def test_exact_match_scores_high_with_explanation() -> None:
    p = _c("pay_1", 850_000_00, ref="INV-439", cp="abc", day=100)
    inv = _c("inv_1", 850_000_00, ref="INV-439", cp="abc", day=95)
    result = score(p, inv)
    assert result.confidence > 0.9
    assert "exact amount" in result.explanation
    assert "INV-439" in result.explanation


def test_greedy_assignment_is_one_to_one() -> None:
    payments = [_c("p1", 1000, ref="INV-1"), _c("p2", 2000, ref="INV-2")]
    invoices = [_c("i1", 1000, ref="INV-1"), _c("i2", 2000, ref="INV-2")]
    pairs = best_matches(payments, invoices, threshold=0.6)
    assert {(p, i) for p, i, _ in pairs} == {("p1", "i1"), ("p2", "i2")}


def test_below_threshold_pairs_are_dropped() -> None:
    payments = [_c("p1", 999, ref="ZZZ")]
    invoices = [_c("i1", 5000, ref="QQQ")]
    assert best_matches(payments, invoices, threshold=0.6) == []
