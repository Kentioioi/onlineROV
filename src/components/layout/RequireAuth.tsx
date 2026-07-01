import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";

export function RequireAuth() {
  const { user, loading, pendingAction } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Laster...
      </div>
    );
  }

  // A "recovery" callback logs the user in automatically, but they haven't
  // set a new password yet - force them through /login's SetPasswordForm
  // before letting them into any protected route.
  if (!user || pendingAction) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
