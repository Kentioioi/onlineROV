import { createReport, uploadImage, ApiError } from "@/lib/api";
import {
  cleanupSyncedOutbox,
  countPending,
  deleteOutboxImage,
  getOfflineDb,
  getOutboxReport,
  listPendingOutboxImages,
  listPendingOutboxReports,
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
 *
 * force=true (the manual "Synkroniser nå" button) also retries records the
 * server permanently rejected (4xx); the automatic triggers skip those so a
 * doomed payload doesn't re-upload full photo blobs every 45 seconds.
 */
export async function syncNow(options?: { force?: boolean }): Promise<void> {
  const force = options?.force ?? false;
  if (syncing) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  syncing = true;
  try {
    const pendingReports = (await listPendingOutboxReports()).filter((r) => force || !r.permanentError);
    for (const record of pendingReports) {
      await syncReport(record);
    }
    // Drain images whose parent report is NOT pending in the outbox - the
    // report already exists server-side, either because it was created
    // online (never entered the outbox) and only the photo upload hit a
    // network failure, or because an earlier sync run created the report
    // but died mid-image-batch. Without this sweep such photos stayed
    // queued in IndexedDB forever with the badge stuck at "N venter".
    const stillPending = new Set((await listPendingOutboxReports()).map((r) => r.id));
    const stranded = (await listPendingOutboxImages()).filter(
      (img) => !stillPending.has(img.reportId) && (force || !img.permanentError),
    );
    await uploadWithConcurrency(stranded);
    await cleanupSyncedOutbox();
  } finally {
    syncing = false;
    notifyPendingChanged();
  }
}

/** Server said 4xx: the payload itself is rejected and a retry of the same
 * bytes can never succeed. 401 (log in again) and 408/429 (transient) are
 * still retryable. */
function isPermanentRejection(err: unknown): boolean {
  return err instanceof ApiError && err.status >= 400 && err.status < 500 && ![401, 408, 429].includes(err.status);
}

async function syncReport(record: OutboxReport): Promise<void> {
  const db = await getOfflineDb();
  // Captured before the POST: if the user re-queues newer data while the
  // request is in flight, markReportSynced sees the mismatch and refuses -
  // the newer record stays pending and syncs on the next pass.
  const attemptLocalUpdatedAt = record.localUpdatedAt;
  record.syncState = "syncing";
  record.lastSyncAttemptAt = new Date().toISOString();
  record.syncAttemptCount += 1;
  await db.put("outbox_reports", record);
  notifyPendingChanged();

  try {
    const result = await createReport(record.data);
    await markReportSynced(record.id, result.reportNumber, attemptLocalUpdatedAt);
    notifyPendingChanged();
    await syncImagesForReport(record.id);
  } catch (err) {
    // Re-read before writing failure state - the record may have been
    // replaced with newer data (or deleted by a successful manual save)
    // while the request was in flight.
    const current = await db.get("outbox_reports", record.id);
    if (!current || current.localUpdatedAt !== attemptLocalUpdatedAt) {
      notifyPendingChanged();
      return;
    }
    current.syncState = "sync_failed";
    current.syncErrorMessage = errorMessage(err);
    current.permanentError = isPermanentRejection(err);
    await db.put("outbox_reports", current);
    notifyPendingChanged();
  }
}

async function syncImagesForReport(reportId: string): Promise<void> {
  await uploadWithConcurrency(await listPendingOutboxImages(reportId));
}

async function uploadWithConcurrency(images: OutboxImage[]): Promise<void> {
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
    // Delete rather than mark-synced: frees the photo blob from IndexedDB
    // immediately (storage pressure matters on iOS).
    await deleteOutboxImage(record.id);
  } catch (err) {
    record.syncState = "sync_failed";
    record.syncErrorMessage = errorMessage(err);
    record.permanentError = isPermanentRejection(err);
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

export async function queueReportForSync(id: string, data: OutboxReport["data"]): Promise<void> {
  const now = new Date().toISOString();
  const existing = await getOutboxReport(id);
  await saveOutboxReport({
    id,
    data,
    syncState: "draft_local",
    reportNumber: existing?.reportNumber ?? null,
    localCreatedAt: existing?.localCreatedAt ?? now,
    // Always a fresh localUpdatedAt: this is what lets markReportSynced
    // detect that an in-flight sync attempt no longer represents the
    // queued data. New data also resets a permanent rejection - the
    // changed payload deserves a fresh attempt.
    localUpdatedAt: now,
    lastSyncAttemptAt: existing?.lastSyncAttemptAt ?? null,
    syncErrorMessage: null,
    syncAttemptCount: existing?.syncAttemptCount ?? 0,
    permanentError: false,
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
