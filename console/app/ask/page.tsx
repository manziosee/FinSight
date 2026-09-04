"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { ApiError, type Answer, askQuestion } from "@/lib/api";

const SUGGESTIONS = [
  "How many payments are unmatched and why?",
  "What's the total value of open invoices?",
  "Are there any reconciliation exceptions I should look at?",
];

export default function AskPage() {
  const { connected } = useAuth();
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ask(q: string) {
    if (!q.trim()) return;
    setBusy(true);
    setError(null);
    setAnswer(null);
    try {
      setAnswer(await askQuestion(q));
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : String(err));
    } finally {
      setBusy(false);
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
      <h1>Ask your finances</h1>
      <p className="lead">
        The answer is grounded in a live reconciliation summary pulled at request time —
        the <code>grounded</code> flag tells you whether real evidence backed it.
      </p>

      <div className="card">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(question);
          }}
        >
          <div className="field">
            <label htmlFor="q">Question</label>
            <textarea
              id="q"
              rows={3}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. Which counterparties have the most unmatched payments?"
            />
          </div>
          <div className="row" style={{ marginBottom: 14, flexWrap: "wrap" }}>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                className="secondary"
                onClick={() => {
                  setQuestion(s);
                  ask(s);
                }}
              >
                {s}
              </button>
            ))}
          </div>
          {error && <div className="error-box">{error}</div>}
          <button type="submit" disabled={busy || !question.trim()}>
            {busy ? "Thinking…" : "Ask"}
          </button>
        </form>

        {answer && (
          <div style={{ marginTop: 20 }}>
            <div className="row" style={{ marginBottom: 10 }}>
              <span className={`pill ${answer.grounded ? "accepted" : "pending"}`}>
                {answer.grounded ? "grounded" : "ungrounded"}
              </span>
              <span className="muted">confidence {(answer.confidence * 100).toFixed(0)}%</span>
            </div>
            <p>{answer.answer}</p>
            <details>
              <summary className="muted" style={{ cursor: "pointer" }}>
                Evidence used
              </summary>
              <pre className="evidence">{JSON.stringify(answer.evidence, null, 2)}</pre>
            </details>
          </div>
        )}
      </div>
    </>
  );
}
