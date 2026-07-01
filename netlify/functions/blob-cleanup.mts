import type { Config } from "@netlify/functions";
import { db } from "../../db/index.js";
import { reportImages } from "../../db/schema.js";
import { getReportStore } from "./_shared/blobs.js";

const ORPHAN_AGE_MS = 48 * 60 * 60 * 1000;

// Deletes image blobs uploaded via optimistic per-photo upload (on drop,
// before the report itself is saved) that never ended up attached to a
// saved report - e.g. the user dropped photos then abandoned the report.
export default async () => {
  const store = getReportStore();
  const [{ blobs }, knownKeys] = await Promise.all([
    store.list({ prefix: "reports/" }),
    db.select({ blobKey: reportImages.blobKey }).from(reportImages).then((rows) => new Set(rows.map((r) => r.blobKey))),
  ]);

  const now = Date.now();
  let deleted = 0;

  for (const blob of blobs) {
    if (knownKeys.has(blob.key)) continue;
    const meta = await store.getMetadata(blob.key);
    const uploadedAt = meta?.metadata?.uploadedAt as string | undefined;
    const ageMs = uploadedAt ? now - new Date(uploadedAt).getTime() : Number.POSITIVE_INFINITY;
    if (ageMs > ORPHAN_AGE_MS) {
      await store.delete(blob.key);
      deleted++;
    }
  }

  console.log(`blob-cleanup: deleted ${deleted} orphaned image(s) of ${blobs.length} scanned`);
};

export const config: Config = {
  schedule: "@daily",
};
