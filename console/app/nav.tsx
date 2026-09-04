"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";

const LINKS = [
  { href: "/", label: "Connect" },
  { href: "/upload", label: "Upload" },
  { href: "/reconciliation", label: "Reconciliation" },
  { href: "/ask", label: "Ask" },
  { href: "/audit", label: "Audit" },
];

export function TopNav() {
  const pathname = usePathname();
  const { connected, disconnect } = useAuth();

  return (
    <nav className="topbar">
      <div className="row" style={{ gap: 24 }}>
        <span className="brand">FinSight Console</span>
        <div className="links">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={pathname === l.href ? "active" : ""}>
              {l.label}
            </Link>
          ))}
        </div>
      </div>
      <div className="row">
        <span className={`badge ${connected ? "on" : ""}`}>
          <span className="dot" />
          {connected ? "connected" : "not connected"}
        </span>
        {connected && (
          <button className="secondary" onClick={disconnect}>
            Disconnect
          </button>
        )}
      </div>
    </nav>
  );
}
