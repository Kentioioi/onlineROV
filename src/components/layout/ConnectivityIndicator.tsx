import { useEffect, useState } from "react";
import { CloudOff, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { countPending, onPendingChanged, startAutoSync, syncNow } from "@/offline/syncManager";

// Rendered in both the desktop header and inside the mobile Sheet trigger
// area at once (CSS-hidden, not unmounted, per the responsive header
// pattern) - startAutoSync() is idempotent (guarded in syncManager) so a
// second mount is harmless.
export function ConnectivityIndicator({ compact = false }: { compact?: boolean }) {
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const stop = startAutoSync();
    const refreshPending = () => void countPending().then(setPending);
    refreshPending();
    const unsubscribe = onPendingChanged(refreshPending);

    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    return () => {
      stop();
      unsubscribe();
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  async function handleSyncNow() {
    setSyncing(true);
    try {
      // force: the manual button also retries records the server has
      // permanently rejected - the user explicitly asked for a retry.
      await syncNow({ force: true });
    } finally {
      setSyncing(false);
    }
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={handleSyncNow}
        disabled={syncing || !online || pending === 0}
        className="relative flex h-9 w-9 items-center justify-center rounded-md text-white disabled:cursor-default"
        aria-label="Synkroniseringsstatus"
      >
        {online ? <Wifi className="h-4 w-4 text-emerald-400" /> : <WifiOff className="h-4 w-4 text-red-400" />}
        {pending > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-medium text-[#0b2540]">
            {pending}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      {online ? (
        <Wifi className="h-3.5 w-3.5 text-emerald-400" />
      ) : (
        <WifiOff className="h-3.5 w-3.5 text-red-400" />
      )}
      {pending > 0 && (
        <>
          <Badge variant="outline" className="gap-1 border-white/30 text-white">
            <CloudOff className="h-3 w-3" />
            {pending} venter
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2 text-white hover:bg-white/10"
            onClick={handleSyncNow}
            disabled={syncing || !online}
          >
            <RefreshCw className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`} />
            Synkroniser nå
          </Button>
        </>
      )}
    </div>
  );
}
