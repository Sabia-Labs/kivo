"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

const API_BASE = "/api";

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

  // Rehydrate from localStorage or URL params on mount.
  useEffect(() => {
    try {
      // 1. Check URL params (for cross-domain signup transition)
      const params = new URLSearchParams(window.location.search);
      const urlToken = params.get("token");
      const urlUser = params.get("user");
      const urlWorkspaceId = params.get("workspaceId");

      if (urlToken && urlUser) {
        const decodedUser = JSON.parse(decodeURIComponent(urlUser)) as AuthUser;
        localStorage.setItem("kivo_token", urlToken);
        localStorage.setItem("kivo_user", JSON.stringify(decodedUser));
        setToken(urlToken);
        setUser(decodedUser);
        
        if (urlWorkspaceId) {
          localStorage.setItem("kivo_workspace_id", urlWorkspaceId);
          setWorkspaceId(urlWorkspaceId);
        }
        
        // Clean up URL to keep it pretty and avoid re-processing on refresh
        const url = new URL(window.location.href);
        url.searchParams.delete("token");
        url.searchParams.delete("user");
        url.searchParams.delete("workspaceId");
        window.history.replaceState({}, "", url.pathname);
      } else {
        // 2. Check localStorage
        const storedToken = localStorage.getItem("kivo_token");
        const storedUser = localStorage.getItem("kivo_user");
        const storedWorkspaceId = localStorage.getItem("kivo_workspace_id");
        
        if (storedToken && storedUser) {
          setToken(storedToken);
          setUser(JSON.parse(storedUser) as AuthUser);
        }
        if (storedWorkspaceId) {
          setWorkspaceId(storedWorkspaceId);
        }
      }
    } catch (err) {
      console.error("Auth rehydration failed:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = useCallback((newToken: string, newUser: AuthUser, newWorkspaceId?: string | null) => {
    localStorage.setItem("kivo_token", newToken);
    localStorage.setItem("kivo_user", JSON.stringify(newUser));
    if (newWorkspaceId) {
      localStorage.setItem("kivo_workspace_id", newWorkspaceId);
    }
    
    setToken(newToken);
    setUser(newUser);
    setWorkspaceId(newWorkspaceId ?? null);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("kivo_token");
    localStorage.removeItem("kivo_user");
    localStorage.removeItem("kivo_workspace_id");
    setToken(null);
    setUser(null);
    setWorkspaceId(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, workspaceId, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { API_BASE };
