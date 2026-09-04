"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { ApiError, type IngestionAccepted, uploadFile } from "@/lib/api";

const SOURCES = ["bank", "mobile_money", "erp", "accounting", "pos", "spreadsheet"];

export default function UploadPage() {
  const { connected } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState("bank");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<IngestionAccepted | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await uploadFile(file, source));
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
      <h1>Upload financial data</h1>
      <p className="lead">
        CSV, JSON, Excel or a bank-statement PDF. Ingestion lands it in object storage;
        normalization parses it into the Universal Financial Schema and resolves
        counterparties; reconciliation and the graph pick it up automatically.
      </p>

      <div className="card" style={{ maxWidth: 480 }}>
        <form onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="source">Source</label>
            <select
              id="source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              style={{
                width: "100%",
                background: "#0e1219",
                border: "1px solid var(--panel-border)",
                borderRadius: 8,
                padding: "10px 12px",
                color: "var(--text)",
              }}
            >
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="file">File</label>
            <input
              id="file"
              type="file"
              accept=".csv,.json,.xlsx,.xls,.pdf,text/csv,application/json"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          {error && <div className="error-box">{error}</div>}
          <button type="submit" disabled={!file || busy}>
            {busy ? "Uploading…" : "Upload"}
          </button>
        </form>

        {result && (
          <div style={{ marginTop: 18 }}>
            <p style={{ color: "var(--ok)" }}>Accepted — {result.status}</p>
            <table>
              <tbody>
                <tr>
                  <td className="muted">Ingestion ID</td>
                  <td>
                    <code>{result.ingestion_id}</code>
                  </td>
                </tr>
                <tr>
                  <td className="muted">Object</td>
                  <td>
                    <code>{result.s3_uri}</code>
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
              Give the pipeline a few seconds, then go to{" "}
              <Link href="/reconciliation">Reconciliation</Link> and run it.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
