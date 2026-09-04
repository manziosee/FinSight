"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  ApiError,
  type Answer,
  type MatchOut,
  type RunResult,
  explainMatch,
  reviewMatch,
  runReconciliation,
} from "@/lib/api";

function money(minor: number): string {
  return (minor / 100).toLocaleString(undefined, { minimumFractionDigits: 2 });
}

export default function ReconciliationPage() {
  const { connected } = useAuth();
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [explaining, setExplaining] = useState<string | null>(null);
  const [explanations, setExplanations] = useState<Record<string, Answer>>({});

  async function doRun() {
    setBusy(true);
    setError(null);
    try {
      setRun(await runReconciliation());
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function decide(matchId: string, decision: "accept" | "reject") {
    if (!run) return;
    try {
      const updated = await reviewMatch(matchId, decision);
      setRun({
        ...run,
        matches: run.matches.map((m) => (m.id === matchId ? updated : m)),
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : String(err));
    }
  }

  async function explain(matchId: string) {
    if (!run) return;
    setExplaining(matchId);
    try {
      const answer = await explainMatch(run.run_id, matchId);
      setExplanations((prev) => ({ ...prev, [matchId]: answer }));
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : String(err));
    } finally {
      setExplaining(null);
    }
  }

  if (!connected) {
    return (
      <div className="card">
        <p>
          Connect first on the <Link href="/">Connect</Link> page.
        </p>
      </div>
    );
  }

  return (
    <>
      <h1>Reconciliation</h1>
      <p className="lead">
        Runs recompute from scratch each time. Every leftover payment or invoice gets a
        specific reason; every match starts <span className="pill pending">pending</span>{" "}
        unless it&apos;s near-certain — review decisions tune this tenant&apos;s matching
        weights.
      </p>

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>Run reconciliation</h2>
          <button onClick={doRun} disabled={busy}>
            {busy ? "Running…" : "Run now"}
          </button>
        </div>
        {error && (
          <div className="error-box" style={{ marginTop: 14 }}>
            {error}
          </div>
        )}
        {run && (
          <div className="stat-row" style={{ marginTop: 18 }}>
            <div className="stat">
              <div className="n">{run.matched}</div>
              <div className="label">matched</div>
            </div>
            <div className="stat">
              <div className="n">{run.unmatched}</div>
              <div className="label">unmatched</div>
            </div>
            <div className="stat">
              <div className="n">{run.exceptions}</div>
              <div className="label">exceptions</div>
            </div>
          </div>
        )}
      </div>

      {run && run.matches.length > 0 && (
        <div className="card">
          <h2>Matches</h2>
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Payment → Invoice(s)</th>
                <th>Applied</th>
                <th>Confidence</th>
                <th>Explanation</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {run.matches.map((m: MatchOut) => (
                <tr key={m.id}>
                  <td>
                    <span className={`pill ${m.match_type}`}>{m.match_type}</span>
                  </td>
                  <td>
                    <code style={{ fontSize: 11 }}>{m.payment_id.slice(0, 10)}</code>
                    {" → "}
                    {m.invoice_ids.map((i) => (
                      <code key={i} style={{ fontSize: 11, display: "block" }}>
                        {i.slice(0, 10)}
                      </code>
                    ))}
                  </td>
                  <td>{money(m.amount_applied_minor)}</td>
                  <td>{(m.confidence * 100).toFixed(0)}%</td>
                  <td style={{ maxWidth: 260 }}>
                    <span className="muted">{m.explanation}</span>
                    {explanations[m.id] && (
                      <pre className="evidence" style={{ marginTop: 8 }}>
                        {explanations[m.id]!.answer}
                      </pre>
                    )}
                  </td>
                  <td>
                    <span className={`pill ${m.status}`}>{m.status}</span>
                  </td>
                  <td>
                    <div className="row" style={{ flexDirection: "column", gap: 6 }}>
                      {m.status === "pending" && (
                        <>
                          <button onClick={() => decide(m.id, "accept")}>Accept</button>
                          <button className="danger" onClick={() => decide(m.id, "reject")}>
                            Reject
                          </button>
                        </>
                      )}
                      <button
                        className="secondary"
                        disabled={explaining === m.id}
                        onClick={() => explain(m.id)}
                      >
                        {explaining === m.id ? "…" : "Explain"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {run && run.unmatched_items.length > 0 && (
        <div className="card">
          <h2>Unmatched</h2>
          <table>
            <thead>
              <tr>
                <th>Side</th>
                <th>Record</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {run.unmatched_items.map((u) => (
                <tr key={u.record_id}>
                  <td>{u.side}</td>
                  <td>
                    <code style={{ fontSize: 11 }}>{u.record_id.slice(0, 14)}</code>
                  </td>
                  <td className="muted">{u.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
