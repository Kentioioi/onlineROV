import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
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
import { toast } from "sonner";

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

// Last successfully-authenticated user, persisted so an OFFLINE cold start
// (boat, no signal) can trust the previous session instead of dead-ending on
// a login screen that itself requires network. This is display/UX trust
// only - every server call still independently verifies the real session
// cookie, and a genuine 401 (below) clears it and forces re-login.
const LAST_USER_KEY = "searov:last-user";

function readCachedUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(LAST_USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

function writeCachedUser(u: AuthUser | null): void {
  try {
    if (u) localStorage.setItem(LAST_USER_KEY, JSON.stringify(u));
    else localStorage.removeItem(LAST_USER_KEY);
  } catch {
    // Storage unavailable (private mode etc.) - offline-trusted start just
    // won't work, everything else degrades gracefully.
  }
}

function toAuthUser(u: User): AuthUser {
  return { id: u.id, email: u.email ?? "", name: (u.userMetadata?.full_name as string) ?? undefined };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(DEV_BYPASS ? DEV_USER : null);
  const [loading, setLoading] = useState(!DEV_BYPASS);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  // Distinguishes the user clicking "Logg ut" from the session dying under
  // them - only the latter warrants a "you were logged out" explanation.
  const manualLogout = useRef(false);

  useEffect(() => {
    if (DEV_BYPASS) return;

    let unsubscribe: (() => void) | undefined;
    (async () => {
      try {
        const result = await handleAuthCallback().catch(() => null);

        if (result?.type === "invite" && result.token) {
          // No user yet - must call acceptInvite(token, password) before any
          // session exists. Do NOT fall through to getUser() below, which
          // would just report "not logged in" and show the wrong screen.
          setPendingAction({ type: "invite", token: result.token });
          return;
        }

        if (result?.type === "recovery" && result.user) {
          // Identity logs the user in on a recovery link, but they haven't
          // chosen a new password yet - force the reset screen before letting
          // them into the app with whatever password they forgot.
          setUser(toAuthUser(result.user));
          setPendingAction({ type: "recovery" });
          return;
        }

        const current = result?.user ?? (await getUser());
        if (current) {
          const u = toAuthUser(current);
          setUser(u);
          writeCachedUser(u);
        } else if (!navigator.onLine) {
          // Offline cold start: the session can't be verified without
          // network, but a login screen can't work without network either.
          // Trust the last known user so offline report creation works -
          // the whole point of the offline mode.
          setUser(readCachedUser());
        } else {
          setUser(null);
        }
      } catch {
        // Session check itself failed (flaky/absent network) - same
        // offline-trusted fallback rather than a dead end or a stuck
        // "Laster..." screen.
        if (!navigator.onLine) setUser(readCachedUser());
      } finally {
        setLoading(false);
      }

      unsubscribe = onAuthChange((event, u) => {
        if (event === AUTH_EVENTS.LOGIN || event === AUTH_EVENTS.USER_UPDATED) {
          const next = u ? toAuthUser(u) : null;
          setUser(next);
          writeCachedUser(next);
        }
        if (event === AUTH_EVENTS.LOGOUT) {
          setUser(null);
          writeCachedUser(null);
          if (!manualLogout.current) {
            toast.error("Du ble logget ut - logg inn på nytt for å fortsette.");
          }
          manualLogout.current = false;
        }
        // A failed background TOKEN_REFRESH (e.g. offline) is not treated as
        // a logout - the cached session stays trusted until a real 401.
      });
    })();

    return () => unsubscribe?.();
  }, []);

  // apiFetch dispatches this on any real 401 from our own API - the one
  // authoritative "your session is dead" signal. Makes auto-logout explicit
  // instead of the app just quietly failing every request.
  useEffect(() => {
    if (DEV_BYPASS) return;
    const onUnauthorized = () => {
      setUser((prev) => {
        if (prev) toast.error("Økten din er utløpt - logg inn på nytt.");
        return null;
      });
      writeCachedUser(null);
    };
    window.addEventListener("auth:unauthorized", onUnauthorized);
    return () => window.removeEventListener("auth:unauthorized", onUnauthorized);
  }, []);

  const value: AuthContextValue = {
    user,
    loading,
    pendingAction,
    login: async (email, password) => {
      const u = await identityLogin(email, password);
      const next = toAuthUser(u);
      setUser(next);
      writeCachedUser(next);
    },
    logout: async () => {
      manualLogout.current = true;
      await identityLogout();
      setUser(null);
      writeCachedUser(null);
    },
    acceptInvite: async (password) => {
      if (pendingAction?.type !== "invite") throw new Error("No pending invite");
      const u = await identityAcceptInvite(pendingAction.token, password);
      const next = toAuthUser(u);
      setUser(next);
      writeCachedUser(next);
      setPendingAction(null);
    },
    completeRecovery: async (password) => {
      const u = await identityUpdateUser({ password });
      const next = toAuthUser(u);
      setUser(next);
      writeCachedUser(next);
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
