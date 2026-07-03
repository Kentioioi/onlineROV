import type { Config, Context } from "@netlify/functions";
import { asc, eq } from "drizzle-orm";
import { renderToBuffer } from "@react-pdf/renderer";
import { db } from "../../db/index.js";
import { inspectionResults, reportImages, reports } from "../../db/schema.js";
import { getReportStore, pdfBlobKey } from "./_shared/blobs.js";
import { InspectionReportDocument, type ImageWithBytes } from "./_shared/pdf-document.js";
import { resolveUser, unauthorized } from "./_shared/auth.js";
import { isUuid, json, notFound } from "./_shared/http.js";

export default async (req: Request, context: Context) => {
  const user = await resolveUser();
  if (!user) return unauthorized();

  const { id } = context.params;
  if (!isUuid(id)) return notFound("Rapport ikke funnet");

  const [report] = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
  if (!report) return notFound("Rapport ikke funnet");

  // Timestamp captured BEFORE reading the data that goes into the PDF: an
  // edit committed while the PDF renders must make the PDF read as stale
  // (updatedAt > pdfGeneratedAt), not silently pass as current.
  const generatedAt = new Date();

  const [results, images] = await Promise.all([
    db.select().from(inspectionResults).where(eq(inspectionResults.reportId, id)),
    db
      .select()
      .from(reportImages)
      .where(eq(reportImages.reportId, id))
      // Deterministic photo order - regenerating an unchanged report must
      // not shuffle the Bilder section.
      .orderBy(asc(reportImages.category), asc(reportImages.sortOrder), asc(reportImages.createdAt), asc(reportImages.id)),
  ]);

  const store = getReportStore();
  const imagesWithBytes: ImageWithBytes[] = (
    await Promise.all(
      images.map(async (img) => {
        const buf = await store.get(img.blobKey, { type: "arrayBuffer" });
        if (!buf) {
          // A missing blob previously became a zero-byte "image" - dropped
          // silently by the renderer while the count column still counted
          // it. Skipping keeps the PDF honest; the count reflects placed
          // photos only.
          console.warn(`pdf-generate: blob missing for image ${img.id} (${img.blobKey}), skipping`);
          return null;
        }
        return { ...img, data: Buffer.from(buf) };
      }),
    )
  ).filter((img): img is ImageWithBytes => img !== null);

  const buffer = await renderToBuffer(
    InspectionReportDocument({ report, results, images: imagesWithBytes }),
  );

  const [year, month] = report.date.split("-").map(Number);
  const blobKey = pdfBlobKey(id, year || new Date().getUTCFullYear(), month || 1);
  // uploadedAt lets blob-cleanup give freshly-written PDFs a grace period
  // instead of deleting one written moments ago but not yet committed to
  // the reports row below.
  await store.set(blobKey, buffer, {
    metadata: { contentType: "application/pdf", uploadedAt: new Date().toISOString() },
  });

  await db
    .update(reports)
    .set({ pdfBlobKey: blobKey, pdfGeneratedAt: generatedAt })
    .where(eq(reports.id, id));

  return json({
    downloadUrl: `/api/reports/${id}/pdf/download`,
    generatedAt: generatedAt.toISOString(),
  });
};

export const config: Config = {
  path: "/api/reports/:id/pdf",
  method: "POST",
};
