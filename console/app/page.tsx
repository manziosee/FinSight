"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { API_URL } from "@/lib/api";

export default function ConnectPage() {
  const { connected, connecting, error, connect } = useAuth();
  const router = useRouter();
  const [clientId, setClientId] = useState("demo-client");
  const [clientSecret, setClientSecret] = useState("demo-secret");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await connect(clientId, clientSecret);
    router.push("/reconciliation");
  }

  return (
    <>
      <h1>Connect to FinSight</h1>
      <p className="lead">
        The intelligence layer for financial data. Authenticate with an OAuth2
        client-credentials pair issued by identity-service, then upload data, work the
        reconciliation review queue, and ask questions grounded in real evidence.
      </p>

      <div className="card" style={{ maxWidth: 420 }}>
        <h2>API connection</h2>
        <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
          Gateway: <code>{API_URL}</code>
        </p>
        {error && <div className="error-box">{error}</div>}
        {connected ? (
          <p style={{ color: "var(--ok)" }}>
            Connected. Head to <Link href="/upload">Upload</Link> or{" "}
            <Link href="/reconciliation">Reconciliation</Link>.
          </p>
        ) : (
          <form onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="client_id">Client ID</label>
              <input
                id="client_id"
                type="text"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="client_secret">Client secret</label>
              <input
                id="client_secret"
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
              />
            </div>
            <button type="submit" disabled={connecting}>
              {connecting ? "Connecting…" : "Connect"}
            </button>
          </form>
        )}
      </div>

      <div className="card">
        <h2>What this console does</h2>
        <table>
          <tbody>
            <tr>
              <td style={{ width: 140 }}>Upload</td>
              <td className="muted">Push a CSV/JSON/Excel/PDF batch through ingestion.</td>
            </tr>
            <tr>
              <td>Reconciliation</td>
              <td className="muted">
                Run matching, review pending matches, accept/reject/correct — each decision
                tunes this tenant&apos;s matching weights.
              </td>
            </tr>
            <tr>
              <td>Ask</td>
              <td className="muted">
                Ask a question; the answer is grounded in a live reconciliation summary.
              </td>
            </tr>
            <tr>
              <td>Audit</td>
              <td className="muted">Every mutating call, who did it, and the outcome.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
