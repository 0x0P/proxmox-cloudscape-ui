"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { onSessionExpired } from "@/app/lib/api-client";

interface AuthContextValue {
  user: string | null;
  authenticated: boolean;
  loading: boolean;
  logout: () => void;
}

interface SessionResponse {
  username?: string;
  authenticated?: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadSession = async () => {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        const data = (await response.json()) as SessionResponse;

        if (!mounted) {
          return;
        }

        if (response.ok && data.authenticated && data.username) {
          setUser(data.username);
          setAuthenticated(true);
        } else {
          setUser(null);
          setAuthenticated(false);
        }
      } catch {
        if (!mounted) {
          return;
        }

        setUser(null);
        setAuthenticated(false);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void loadSession();

    return () => {
      mounted = false;
    };
  }, []);

  const logout = useCallback(() => {
    void (async () => {
      try {
        await fetch("/api/auth/logout", { method: "POST" });
      } finally {
        setUser(null);
        setAuthenticated(false);
        router.push("/login");
        router.refresh();
      }
    })();
  }, [router]);

  useEffect(() => {
    onSessionExpired(() => {
      setUser(null);
      setAuthenticated(false);
      router.push("/login?expired=1");
      router.refresh();
    });
  }, [router]);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    authenticated,
    loading,
    logout,
  }), [authenticated, loading, logout, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}
