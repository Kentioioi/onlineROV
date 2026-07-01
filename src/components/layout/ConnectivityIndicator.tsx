import { useEffect, useState } from "react";
import { CloudOff, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { countPending, onPendingChanged, startAutoSync, syncNow } from "@/offline/syncManager";

export function ConnectivityIndicator() {
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
      await syncNow();
    } finally {
      setSyncing(false);
    }
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
