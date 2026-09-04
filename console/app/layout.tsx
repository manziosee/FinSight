import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthProvider } from "@/lib/auth";
import { TopNav } from "./nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "FinSight Console",
  description: "Connect data, review reconciliations, ask questions — the FinSight reference UI.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <TopNav />
          <main className="shell">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
