import { createReport, uploadImage, ApiError } from "@/lib/api";
import {
  countPending,
  getOfflineDb,
  listPendingOutboxImages,
  listPendingOutboxReports,
  markImageSynced,
  markReportSynced,
  saveOutboxImage,
  saveOutboxReport,
  type OutboxImage,
  type OutboxReport,
} from "./db";

const events = new EventTarget();
const PENDING_CHANGED = "pending-changed";

function notifyPendingChanged() {
  events.dispatchEvent(new Event(PENDING_CHANGED));
}

export function onPendingChanged(cb: () => void): () => void {
  events.addEventListener(PENDING_CHANGED, cb);
  return () => events.removeEventListener(PENDING_CHANGED, cb);
}

export { countPending };

let syncing = false;

/**
 * Offline v1 only supports CREATING new reports (the boat use case) - an
 * already-synced report is view-only when offline, so this only ever POSTs,
 * never PUTs. reports-create is idempotent (ON CONFLICT (id) DO NOTHING),
 * so a report can be queued here multiple times (e.g. re-saved locally
 * while still offline) and only ever produces one server row.
 */
export async function syncNow(): Promise<void> {
  if (syncing) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  syncing = true;
  try {
    const pendingReports = await listPendingOutboxReports();
    for (const record of pendingReports) {
      await syncReport(record);
    }
  } finally {
    syncing = false;
    notifyPendingChanged();
  }
}

async function syncReport(record: OutboxReport): Promise<void> {
  const db = await getOfflineDb();
  record.syncState = "syncing";
  record.lastSyncAttemptAt = new Date().toISOString();
  record.syncAttemptCount += 1;
  await db.put("outbox_reports", record);
  notifyPendingChanged();

  try {
    const result = await createReport(record.data);
    await markReportSynced(record.id, result.reportNumber);
    notifyPendingChanged();
    await syncImagesForReport(record.id);
  } catch (err) {
    record.syncState = "sync_failed";
    record.syncErrorMessage = errorMessage(err);
    await db.put("outbox_reports", record);
    notifyPendingChanged();
  }
}

async function syncImagesForReport(reportId: string): Promise<void> {
  const images = await listPendingOutboxImages(reportId);
  // Limited concurrency (3 at a time) so a weak boat connection isn't
  // saturated by a burst of large uploads all at once.
  const CONCURRENCY = 3;
  let i = 0;
  async function worker() {
    while (i < images.length) {
      const image = images[i++];
      await syncImage(image);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, images.length) }, worker));
}

async function syncImage(record: OutboxImage): Promise<void> {
  const db = await getOfflineDb();
  record.syncState = "uploading";
  await db.put("outbox_images", record);
  notifyPendingChanged();

  try {
    await uploadImage(record.reportId, {
      id: record.id,
      category: record.category,
      file: record.blob,
      filename: record.originalFilename,
      sortOrder: record.sortOrder,
    });
    await markImageSynced(record.id);
  } catch (err) {
    record.syncState = "sync_failed";
    record.syncErrorMessage = errorMessage(err);
    await db.put("outbox_images", record);
  } finally {
    notifyPendingChanged();
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return "Du må logge inn på nytt for å synkronisere";
    return err.message;
  }
  if (err instanceof TypeError) return "Ingen nettverksforbindelse";
  return "Ukjent feil";
}

export function queueReportForSync(id: string, data: OutboxReport["data"]): Promise<void> {
  const now = new Date().toISOString();
  return saveOutboxReport({
    id,
    data,
    syncState: "draft_local",
    reportNumber: null,
    localCreatedAt: now,
    localUpdatedAt: now,
    lastSyncAttemptAt: null,
    syncErrorMessage: null,
    syncAttemptCount: 0,
  }).then(notifyPendingChanged);
}

export function queueImageForSync(args: {
  id: string;
  reportId: string;
  category: string;
  blob: Blob;
  originalFilename: string;
  contentType: string;
  sortOrder: number;
}): Promise<void> {
  return saveOutboxImage({
    ...args,
    syncState: "pending",
    localCreatedAt: new Date().toISOString(),
    syncErrorMessage: null,
  }).then(notifyPendingChanged);
}

let autoSyncStarted = false;

/**
 * No reliance on the Background Sync API (poor/no Safari support, and
 * inspectors are likely on iPhones/iPads) - flush attempts fire on the
 * `online` event, a foreground periodic retry, and app focus/foreground.
 * A "Synkroniser nå" button (see ConnectivityIndicator) covers manual retry.
 */
export function startAutoSync(): () => void {
  if (autoSyncStarted) return () => undefined;
  autoSyncStarted = true;

  const onOnline = () => void syncNow();
  const onVisible = () => {
    if (document.visibilityState === "visible") void syncNow();
  };
  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onOnline);
  const interval = window.setInterval(() => void syncNow(), 45_000);

  void syncNow();

  return () => {
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", onOnline);
    window.clearInterval(interval);
    autoSyncStarted = false;
  };
}
