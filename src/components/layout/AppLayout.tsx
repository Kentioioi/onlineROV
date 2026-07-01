import { NavLink, Outlet } from "react-router-dom";
import { LogOut, Waves } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConnectivityIndicator } from "@/components/layout/ConnectivityIndicator";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/", label: "Portal", end: true },
  { to: "/reports", label: "Rapporter" },
  { to: "/settings", label: "Innstillinger" },
];

export function AppLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-[#0b2540] text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Waves className="h-5 w-5 text-[#12a5c9]" />
            <span className="font-semibold tracking-wide">SEA ROV</span>
            <span className="text-xs text-[#12a5c9]">ROV Inspector</span>
          </div>
          <nav className="flex items-center gap-4 text-sm">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn("text-white/70 hover:text-white", isActive && "text-white font-medium")
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-3 text-sm text-white/80">
            <ConnectivityIndicator />
            <span>{user?.email}</span>
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={() => logout()}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
