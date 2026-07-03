import type { Config, Context } from "@netlify/functions";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { reportImages, reports } from "../../db/schema.js";
import { getReportStore } from "./_shared/blobs.js";
import { resolveUser, unauthorized } from "./_shared/auth.js";
import { isUuid, json, notFound } from "./_shared/http.js";

export default async (req: Request, context: Context) => {
  const user = await resolveUser();
  if (!user) return unauthorized();

  const { id } = context.params;
  if (!isUuid(id)) return notFound("Rapport ikke funnet");

  const [report] = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
  if (!report) return notFound("Rapport ikke funnet");

  const images = await db.select().from(reportImages).where(eq(reportImages.reportId, id));

  // DB row first, blobs after: if the row delete fails, nothing changed.
  // If a blob delete then fails, the leftover blob only costs storage and
  // the daily blob-cleanup sweeps it. The reverse order could leave a live
  // report whose photos are already destroyed.
  // Cascades to inspection_results and report_images rows via FK.
  await db.delete(reports).where(eq(reports.id, id));

  const store = getReportStore();
  await Promise.all(images.map((img) => store.delete(img.blobKey).catch(() => undefined)));
  if (report.pdfBlobKey) await store.delete(report.pdfBlobKey).catch(() => undefined);

  return json({ ok: true });
};

export const config: Config = {
  path: "/api/reports/:id",
  method: "DELETE",
};
