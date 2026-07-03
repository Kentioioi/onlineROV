import type { Config } from "@netlify/functions";
import { isNotNull } from "drizzle-orm";
import { db } from "../../db/index.js";
import { reportImages, reports } from "../../db/schema.js";
import { getReportStore } from "./_shared/blobs.js";

const ORPHAN_AGE_MS = 48 * 60 * 60 * 1000;

// Deletes orphaned blobs on a daily schedule:
// - image blobs uploaded via optimistic per-photo upload (on drop, before
//   the report itself is saved) whose report was then abandoned
// - PDF blobs whose report row no longer references them (report deleted,
//   or the PDF was regenerated for a different date so the key changed)
export default async () => {
  const store = getReportStore();
  const now = Date.now();
  let deleted = 0;

  const [{ blobs: imageBlobs }, knownImageKeys] = await Promise.all([
    store.list({ prefix: "reports/" }),
    db.select({ blobKey: reportImages.blobKey }).from(reportImages).then((rows) => new Set(rows.map((r) => r.blobKey))),
  ]);

  for (const blob of imageBlobs) {
    if (knownImageKeys.has(blob.key)) continue;
    const meta = await store.getMetadata(blob.key);
    const uploadedAt = meta?.metadata?.uploadedAt as string | undefined;
    const ageMs = uploadedAt ? now - new Date(uploadedAt).getTime() : Number.POSITIVE_INFINITY;
    if (ageMs > ORPHAN_AGE_MS) {
      await store.delete(blob.key);
      deleted++;
    }
  }

  const [{ blobs: pdfBlobs }, knownPdfKeys] = await Promise.all([
    store.list({ prefix: "pdfs/" }),
    db
      .select({ pdfBlobKey: reports.pdfBlobKey })
      .from(reports)
      .where(isNotNull(reports.pdfBlobKey))
      .then((rows) => new Set(rows.map((r) => r.pdfBlobKey))),
  ]);

  for (const blob of pdfBlobs) {
    if (knownPdfKeys.has(blob.key)) continue;
    await store.delete(blob.key);
    deleted++;
  }

  console.log(
    `blob-cleanup: deleted ${deleted} orphaned blob(s) of ${imageBlobs.length + pdfBlobs.length} scanned`,
  );
};

export const config: Config = {
  schedule: "@daily",
};
