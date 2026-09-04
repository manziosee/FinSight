"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getToken, login as apiLogin, setToken as storeToken } from "@/lib/api";

interface AuthState {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  connect: (clientId: string, clientSecret: string) => Promise<void>;
  disconnect: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Deliberately an effect (not a lazy useState initializer): starting `connected` at
  // false matches the prerendered/SSR output exactly, avoiding a hydration mismatch —
  // it flips true in a follow-up commit once localStorage is readable on the client.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConnected(Boolean(getToken()));
  }, []);

  async function connect(clientId: string, clientSecret: string) {
    setConnecting(true);
    setError(null);
    try {
      const { access_token } = await apiLogin(clientId, clientSecret);
      storeToken(access_token);
      setConnected(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "connection failed");
      setConnected(false);
    } finally {
      setConnecting(false);
    }
  }

  function disconnect() {
    storeToken(null);
    setConnected(false);
  }

  return (
    <AuthContext.Provider value={{ connected, connecting, error, connect, disconnect }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
