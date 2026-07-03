import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { AuthError } from "@netlify/identity";
import { Waves } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";

export function LoginPage() {
  const { user, pendingAction, login, acceptInvite, completeRecovery } = useAuth();

  // A pending invite/recovery action always takes priority over the normal
  // redirect - a "recovery" user is technically logged in but must still
  // set a new password before entering the app.
  if (user && !pendingAction) return <Navigate to="/" replace />;

  if (pendingAction) {
    return <SetPasswordForm mode={pendingAction.type} onSubmit={pendingAction.type === "invite" ? acceptInvite : completeRecovery} />;
  }

  return <LoginForm login={login} />;
}

function SetPasswordForm({ mode, onSubmit }: { mode: "invite" | "recovery"; onSubmit: (password: string) => Promise<void> }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Passordet må være minst 8 tegn.");
      return;
    }
    if (password !== confirm) {
      setError("Passordene er ikke like.");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(password);
    } catch (err) {
      setError(err instanceof AuthError ? err.message : "Noe gikk galt. Prøv igjen.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0b2540] p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <Waves className="h-8 w-8 text-[#12a5c9]" />
          <CardTitle>{mode === "invite" ? "Velkommen til SEA ROV Inspector" : "Sett nytt passord"}</CardTitle>
          <CardDescription>
            {mode === "invite" ? "Sett et passord for å aktivere kontoen din." : "Velg et nytt passord for å fortsette."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={handleSubmit}>
            <div className="grid gap-1.5">
              <Label htmlFor="new-password">Nytt passord</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="confirm-password">Bekreft passord</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={submitting}>
              {submitting ? "Lagrer..." : "Aktiver konto"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function LoginForm({ login }: { login: (email: string, password: string) => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      if (err instanceof AuthError) {
        setError(err.status === 401 ? "Feil e-post eller passord." : err.message);
      } else {
        setError("Innlogging feilet. Prøv igjen.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0b2540] p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <Waves className="h-8 w-8 text-[#12a5c9]" />
          <CardTitle>SEA ROV Inspector</CardTitle>
          <CardDescription>Logg inn for å registrere eller se inspeksjonsrapporter</CardDescription>
        </CardHeader>
        <CardContent>
          {!online && (
            <p className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Du er offline - innlogging krever nettforbindelse. Har du logget inn på denne enheten før, åpnes appen
              automatisk uten innlogging når du starter den offline.
            </p>
          )}
          <form className="grid gap-4" onSubmit={handleSubmit}>
            <div className="grid gap-1.5">
              <Label htmlFor="email">E-post</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="password">Passord</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={submitting}>
              {submitting ? "Logger inn..." : "Logg inn"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Ny bruker? Du må inviteres av en administrator for å få tilgang.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
