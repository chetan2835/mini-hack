"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, clearCache, getToken, setToken } from "./api";
import type { TokenResponse, User } from "./types";

interface AuthState {
  user: User | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Restore the session after a full page refresh.
    if (!getToken()) {
      setReady(true);
      return;
    }
    api<User>("/api/auth/me")
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    const onLogout = () => {
      setToken(null);
      clearCache();
      setUser(null);
    };
    window.addEventListener("phoenix:logout", onLogout);
    return () => window.removeEventListener("phoenix:logout", onLogout);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<TokenResponse>("/api/auth/login", {
      method: "POST",
      body: { email, password },
    });
    setToken(res.access_token);
    clearCache();
    setUser(res.user);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    clearCache();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, ready, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
