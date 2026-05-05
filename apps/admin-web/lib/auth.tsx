"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4001";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  workspaceId: string | null;
  isLoading: boolean;
  login: (token: string, user: AuthUser, workspaceId?: string | null) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Rehydrate from localStorage on mount.
  useEffect(() => {
    try {
      // 1. Check for logout query param from kivo-web
      const params = new URLSearchParams(window.location.search);
      if (params.get("logout") === "true") {
        localStorage.removeItem("kivo_token");
        localStorage.removeItem("kivo_user");
        localStorage.removeItem("kivo_workspace_id");
        
        // Clean up URL to avoid redirect loops or messy sharing links
        const url = new URL(window.location.href);
        url.searchParams.delete("logout");
        window.history.replaceState({}, "", url.pathname);
      } else {
        // 2. Load from storage
        const storedToken = localStorage.getItem("kivo_token");
        const storedUser = localStorage.getItem("kivo_user");
        const storedWorkspaceId = localStorage.getItem("kivo_workspace_id");
        if (storedToken && storedUser) {
          setToken(storedToken);
          setUser(JSON.parse(storedUser) as AuthUser);
        }
        if (storedWorkspaceId) setWorkspaceId(storedWorkspaceId);
      }
    } catch {
      // Ignore malformed storage.
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = (newToken: string, newUser: AuthUser, newWorkspaceId?: string | null) => {
    localStorage.setItem("kivo_token", newToken);
    localStorage.setItem("kivo_user", JSON.stringify(newUser));
    if (newWorkspaceId) localStorage.setItem("kivo_workspace_id", newWorkspaceId);
    setToken(newToken);
    setUser(newUser);
    if (newWorkspaceId !== undefined) setWorkspaceId(newWorkspaceId ?? null);
  };

  const logout = () => {
    localStorage.removeItem("kivo_token");
    localStorage.removeItem("kivo_user");
    localStorage.removeItem("kivo_workspace_id");
    setToken(null);
    setUser(null);
    setWorkspaceId(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, workspaceId, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook to access the current auth state.
 * Must be used within AuthProvider.
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { API_BASE };
