"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { ApiError, type AuditEntry, getAudit } from "@/lib/api";

export default function AuditPage() {
  const { connected } = useAuth();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setEntries(await getAudit(50));
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetch-on-mount/on-connect: the standard escape hatch for manual data fetching.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (connected) void load();
  }, [connected, load]);

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
      <h1>Audit trail</h1>
      <p className="lead">
        Every mutating request across every service, captured by the audit middleware and
        stored by identity-service.
      </p>

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
          <h2 style={{ margin: 0 }}>Recent activity</h2>
          <button className="secondary" onClick={() => void load()} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
        {error && <div className="error-box">{error}</div>}
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Service</th>
              <th>Outcome</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={i}>
                <td className="muted">{new Date(e.occurred_at).toLocaleString()}</td>
                <td>{e.actor}</td>
                <td>
                  <code style={{ fontSize: 12 }}>{e.action}</code>
                </td>
                <td className="muted">{e.producer}</td>
                <td>
                  <span className={`pill ${e.outcome === "allow" ? "accepted" : "rejected"}`}>
                    {e.outcome}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {entries.length === 0 && !loading && <p className="muted">No audit events yet.</p>}
      </div>
    </>
  );
}
