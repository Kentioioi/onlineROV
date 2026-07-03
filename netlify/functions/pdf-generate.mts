import type { Config, Context } from "@netlify/functions";
import { eq } from "drizzle-orm";
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

  const [results, images] = await Promise.all([
    db.select().from(inspectionResults).where(eq(inspectionResults.reportId, id)),
    db.select().from(reportImages).where(eq(reportImages.reportId, id)),
  ]);

  const store = getReportStore();
  const imagesWithBytes: ImageWithBytes[] = await Promise.all(
    images.map(async (img) => {
      const buf = await store.get(img.blobKey, { type: "arrayBuffer" });
      return { ...img, data: Buffer.from(buf ?? new ArrayBuffer(0)) };
    }),
  );

  const buffer = await renderToBuffer(
    InspectionReportDocument({ report, results, images: imagesWithBytes }),
  );

  const [year, month] = report.date.split("-").map(Number);
  const blobKey = pdfBlobKey(id, year || new Date().getUTCFullYear(), month || 1);
  await store.set(blobKey, buffer, { metadata: { contentType: "application/pdf" } });

  const generatedAt = new Date();
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
