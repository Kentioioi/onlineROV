import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  acceptInvite as identityAcceptInvite,
  getUser,
  handleAuthCallback,
  login as identityLogin,
  logout as identityLogout,
  onAuthChange,
  updateUser as identityUpdateUser,
  AUTH_EVENTS,
  type User,
} from "@netlify/identity";

type AuthUser = { id: string; email: string; name?: string };

// A raw invite/recovery link lands the user on this page too (Netlify
// appends an auth hash to the site's root). Until they set a real password,
// they're neither "logged in" nor should see the plain login form - the UI
// must show a dedicated "set your password" step for either case.
type PendingAction = { type: "invite"; token: string } | { type: "recovery" };

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  pendingAction: PendingAction | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  acceptInvite: (password: string) => Promise<void>;
  completeRecovery: (password: string) => Promise<void>;
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
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  useEffect(() => {
    if (DEV_BYPASS) return;

    let unsubscribe: (() => void) | undefined;
    (async () => {
      const result = await handleAuthCallback().catch(() => null);

      if (result?.type === "invite" && result.token) {
        // No user yet - must call acceptInvite(token, password) before any
        // session exists. Do NOT fall through to getUser() below, which
        // would just report "not logged in" and show the wrong screen.
        setPendingAction({ type: "invite", token: result.token });
        setLoading(false);
        return;
      }

      if (result?.type === "recovery" && result.user) {
        // Identity logs the user in on a recovery link, but they haven't
        // chosen a new password yet - force the reset screen before letting
        // them into the app with whatever password they forgot.
        setUser(toAuthUser(result.user));
        setPendingAction({ type: "recovery" });
        setLoading(false);
        return;
      }

      const current = result?.user ?? (await getUser());
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
    pendingAction,
    login: async (email, password) => {
      const u = await identityLogin(email, password);
      setUser(toAuthUser(u));
    },
    logout: async () => {
      await identityLogout();
      setUser(null);
    },
    acceptInvite: async (password) => {
      if (pendingAction?.type !== "invite") throw new Error("No pending invite");
      const u = await identityAcceptInvite(pendingAction.token, password);
      setUser(toAuthUser(u));
      setPendingAction(null);
    },
    completeRecovery: async (password) => {
      const u = await identityUpdateUser({ password });
      setUser(toAuthUser(u));
      setPendingAction(null);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
