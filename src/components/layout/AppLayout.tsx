import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { LogOut, Menu, Waves } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
} from "@/components/ui/sheet";
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
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-[#0b2540] text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <Waves className="h-5 w-5 shrink-0 text-[#12a5c9]" />
            <span className="truncate font-semibold tracking-wide">SEA ROV</span>
          </div>

          {/* Desktop nav - hidden below md, everything moves into the Sheet instead */}
          <nav className="hidden items-center gap-4 text-sm md:flex">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => cn("text-white/70 hover:text-white", isActive && "font-medium text-white")}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="hidden items-center gap-3 text-sm text-white/80 md:flex">
            <ConnectivityIndicator />
            <span className="max-w-40 truncate">{user?.email}</span>
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={() => logout()}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>

          {/* Mobile: everything collapses behind a single menu button */}
          <div className="flex items-center gap-1 md:hidden">
            <ConnectivityIndicator compact />
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right">
                <SheetHeader>
                  <SheetTitle>SEA ROV Inspector</SheetTitle>
                </SheetHeader>
                <nav className="flex flex-col gap-1 px-4">
                  {NAV_ITEMS.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      onClick={() => setMenuOpen(false)}
                      className={({ isActive }) =>
                        cn(
                          "rounded-md px-3 py-2.5 text-base",
                          isActive ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted",
                        )
                      }
                    >
                      {item.label}
                    </NavLink>
                  ))}
                </nav>
                <SheetFooter>
                  <p className="truncate px-1 text-xs text-muted-foreground">{user?.email}</p>
                  <Button
                    variant="outline"
                    className="justify-start gap-2"
                    onClick={() => {
                      setMenuOpen(false);
                      logout();
                    }}
                  >
                    <LogOut className="h-4 w-4" /> Logg ut
                  </Button>
                </SheetFooter>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
