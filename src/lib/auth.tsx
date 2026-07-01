import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  getUser,
  handleAuthCallback,
  login as identityLogin,
  logout as identityLogout,
  onAuthChange,
  AUTH_EVENTS,
  type User,
} from "@netlify/identity";

type AuthUser = { id: string; email: string; name?: string };

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

// Local-dev-only bypass: only active when running under Vite dev AND the
// var is explicitly set in a gitignored .env.development - never defined in
// any real deploy, so there is no runtime flag to accidentally leave on.
// Netlify Identity does not work under `netlify dev` (hosted service), so
// this is what makes the ~90% of work where "who's logged in" is incidental
// testable locally without a deploy-preview round trip every time.
const DEV_BYPASS = import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH_BYPASS === "true";
const DEV_USER: AuthUser = { id: "dev-user", email: "dev@local", name: "Dev" };

function toAuthUser(u: User): AuthUser {
  return { id: u.id, email: u.email ?? "", name: (u.userMetadata?.full_name as string) ?? undefined };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(DEV_BYPASS ? DEV_USER : null);
  const [loading, setLoading] = useState(!DEV_BYPASS);

  useEffect(() => {
    if (DEV_BYPASS) return;

    let unsubscribe: (() => void) | undefined;
    (async () => {
      await handleAuthCallback().catch(() => undefined);
      const current = await getUser();
      setUser(current ? toAuthUser(current) : null);
      setLoading(false);

      unsubscribe = onAuthChange((event, u) => {
        if (event === AUTH_EVENTS.LOGIN) setUser(u ? toAuthUser(u) : null);
        if (event === AUTH_EVENTS.LOGOUT) setUser(null);
        if (event === AUTH_EVENTS.USER_UPDATED) setUser(u ? toAuthUser(u) : null);
        // A failed background TOKEN_REFRESH (e.g. offline) is not treated as
        // a logout - the cached session stays trusted until a real 401.
      });
    })();

    return () => unsubscribe?.();
  }, []);

  const value: AuthContextValue = {
    user,
    loading,
    login: async (email, password) => {
      const u = await identityLogin(email, password);
      setUser(toAuthUser(u));
    },
    logout: async () => {
      await identityLogout();
      setUser(null);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
