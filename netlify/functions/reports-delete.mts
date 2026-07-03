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

  // Delete blobs before the DB row: an orphaned blob only costs storage,
  // while an orphaned DB reference to a deleted blob breaks the UI.
  const store = getReportStore();
  await Promise.all(images.map((img) => store.delete(img.blobKey).catch(() => undefined)));
  if (report.pdfBlobKey) await store.delete(report.pdfBlobKey).catch(() => undefined);

  // Cascades to inspection_results and report_images rows via FK.
  await db.delete(reports).where(eq(reports.id, id));

  return json({ ok: true });
};

export const config: Config = {
  path: "/api/reports/:id",
  method: "DELETE",
};
