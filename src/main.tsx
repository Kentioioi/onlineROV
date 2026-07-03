import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { registerSW } from "virtual:pwa-register";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/lib/auth";
import { router } from "./App.tsx";
import "./index.css";

// A boat tablet can keep the PWA open for days - without a periodic check
// the service worker only looks for updates on full page loads, so a stale
// app shell could run indefinitely. autoUpdate mode applies the new version
// on the next navigation once found.
registerSW({
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    setInterval(() => void registration.update().catch(() => {}), 60 * 60 * 1000);
  },
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

// Ask the browser not to evict our storage under disk pressure - the
// IndexedDB outbox can hold not-yet-synced inspection reports and photos,
// which are irreplaceable until they reach the server. Best-effort: browsers
// may say no (returns false), but without asking, iOS Safari in particular
// is aggressive about evicting storage for non-installed sites.
if (typeof navigator !== "undefined" && navigator.storage?.persist) {
  void navigator.storage.persist().catch(() => {});
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
        <Toaster richColors position="top-center" />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
