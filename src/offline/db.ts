import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { ReportInput } from "../../shared/schema";
import type { FieldOption } from "../../db/schema";

export type SyncState = "draft_local" | "syncing" | "synced" | "sync_failed";

export type OutboxReport = {
  id: string;
  data: ReportInput;
  syncState: SyncState;
  reportNumber: number | null;
  localCreatedAt: string;
  localUpdatedAt: string;
  lastSyncAttemptAt: string | null;
  syncErrorMessage: string | null;
  syncAttemptCount: number;
  // Server rejected the payload outright (4xx) - auto-retry can never
  // succeed, so only an explicit manual "Synkroniser nå" retries it.
  permanentError?: boolean;
};

export type OutboxImageSyncState = "pending" | "uploading" | "synced" | "sync_failed";

export type OutboxImage = {
  id: string;
  reportId: string;
  category: string;
  blob: Blob;
  originalFilename: string;
  contentType: string;
  sortOrder: number;
  syncState: OutboxImageSyncState;
  localCreatedAt: string;
  syncErrorMessage: string | null;
  // See OutboxReport.permanentError.
  permanentError?: boolean;
};

interface RovInspectorDb extends DBSchema {
  outbox_reports: {
    key: string;
    value: OutboxReport;
    indexes: { syncState: string };
  };
  outbox_images: {
    key: string;
    value: OutboxImage;
    indexes: { reportId: string; syncState: string };
  };
  field_options_cache: {
    key: number;
    value: FieldOption;
    indexes: { fieldKey: string };
  };
}

let dbPromise: Promise<IDBPDatabase<RovInspectorDb>> | null = null;

export function getOfflineDb(): Promise<IDBPDatabase<RovInspectorDb>> {
  if (!dbPromise) {
    dbPromise = openDB<RovInspectorDb>("rov-inspector-offline", 1, {
      upgrade(db) {
        const reports = db.createObjectStore("outbox_reports", { keyPath: "id" });
        reports.createIndex("syncState", "syncState");

        const images = db.createObjectStore("outbox_images", { keyPath: "id" });
        images.createIndex("reportId", "reportId");
        images.createIndex("syncState", "syncState");

        const options = db.createObjectStore("field_options_cache", { keyPath: "id" });
        options.createIndex("fieldKey", "fieldKey");
      },
    });
    // A transiently failed open (e.g. storage pressure) must not be cached
    // forever - clear so the next call retries instead of permanently
    // disabling all offline functionality for the session.
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

export async function saveOutboxReport(record: OutboxReport): Promise<void> {
  const db = await getOfflineDb();
  await db.put("outbox_reports", record);
}

export async function getOutboxReport(id: string): Promise<OutboxReport | undefined> {
  const db = await getOfflineDb();
  return db.get("outbox_reports", id);
}

export async function listPendingOutboxReports(): Promise<OutboxReport[]> {
  const db = await getOfflineDb();
  const all = await db.getAll("outbox_reports");
  return all.filter((r) => r.syncState !== "synced");
}

/**
 * Marks an outbox report synced - but ONLY if the record hasn't been
 * re-queued with newer data since the sync attempt started. Without the
 * expectedLocalUpdatedAt guard, this race lost data: syncNow POSTs dataV1,
 * the user re-saves offline (outbox now holds dataV2), the V1 POST
 * completes and blindly flipped the V2 record to synced - V2 then never
 * synced anywhere and cleanupSyncedOutbox deleted it.
 */
export async function markReportSynced(
  id: string,
  reportNumber: number,
  expectedLocalUpdatedAt?: string,
): Promise<void> {
  const db = await getOfflineDb();
  const record = await db.get("outbox_reports", id);
  if (!record) return;
  if (expectedLocalUpdatedAt !== undefined && record.localUpdatedAt !== expectedLocalUpdatedAt) return;
  record.syncState = "synced";
  record.reportNumber = reportNumber;
  record.syncErrorMessage = null;
  await db.put("outbox_reports", record);
}

export async function deleteOutboxReport(id: string): Promise<void> {
  const db = await getOfflineDb();
  await db.delete("outbox_reports", id);
}

export async function saveOutboxImage(record: OutboxImage): Promise<void> {
  const db = await getOfflineDb();
  await db.put("outbox_images", record);
}

export async function listPendingOutboxImages(reportId?: string): Promise<OutboxImage[]> {
  const db = await getOfflineDb();
  const all = reportId ? await db.getAllFromIndex("outbox_images", "reportId", reportId) : await db.getAll("outbox_images");
  return all.filter((i) => i.syncState !== "synced");
}

export async function deleteOutboxImage(id: string): Promise<void> {
  const db = await getOfflineDb();
  await db.delete("outbox_images", id);
}

/**
 * Removes fully-completed work from IndexedDB: synced report records whose
 * images are all uploaded, and any leftover synced image records. Without
 * this the outbox (including full-size photo blobs) grew forever - a real
 * storage-pressure problem on iOS, where eviction nukes the whole DB.
 */
export async function cleanupSyncedOutbox(): Promise<void> {
  const db = await getOfflineDb();
  const [reports, images] = await Promise.all([db.getAll("outbox_reports"), db.getAll("outbox_images")]);
  const reportIdsWithImages = new Set(images.filter((i) => i.syncState !== "synced").map((i) => i.reportId));
  const tx = db.transaction(["outbox_reports", "outbox_images"], "readwrite");
  for (const img of images) {
    if (img.syncState === "synced") void tx.objectStore("outbox_images").delete(img.id);
  }
  for (const r of reports) {
    if (r.syncState === "synced" && !reportIdsWithImages.has(r.id)) {
      void tx.objectStore("outbox_reports").delete(r.id);
    }
  }
  await tx.done;
}

export async function cacheFieldOptions(options: FieldOption[]): Promise<void> {
  const db = await getOfflineDb();
  const tx = db.transaction("field_options_cache", "readwrite");
  await tx.store.clear();
  await Promise.all(options.map((o) => tx.store.put(o)));
  await tx.done;
}

export async function getCachedFieldOptions(): Promise<FieldOption[]> {
  const db = await getOfflineDb();
  return db.getAll("field_options_cache");
}

export async function countPending(): Promise<number> {
  const [reports, images] = await Promise.all([listPendingOutboxReports(), listPendingOutboxImages()]);
  return reports.length + images.length;
}
