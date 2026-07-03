import type { Config, Context } from "@netlify/functions";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { reportImages, reports } from "../../db/schema.js";
import { getReportStore } from "./_shared/blobs.js";
import { resolveUser, unauthorized } from "./_shared/auth.js";
import { isUuid, json, notFound } from "./_shared/http.js";

export default async (req: Request, context: Context) => {
  const user = await resolveUser();
  if (!user) return unauthorized();

  const { id: reportId, imageId } = context.params;
  if (!isUuid(reportId) || !isUuid(imageId)) return notFound("Bilde ikke funnet");

  const [row] = await db
    .select()
    .from(reportImages)
    .where(and(eq(reportImages.id, imageId), eq(reportImages.reportId, reportId)))
    .limit(1);
  if (!row) return notFound("Bilde ikke funnet");

  // DB row first, blob after: a failed blob delete leaves an orphaned blob
  // (cheap, swept by the daily cleanup); the reverse order could leave a
  // live image row whose bytes are gone - a permanently broken thumbnail.
  await db.delete(reportImages).where(eq(reportImages.id, imageId));
  await getReportStore()
    .delete(row.blobKey)
    .catch(() => undefined);
  // Photo changes are report changes - keeps the "PDF is stale" check honest.
  await db.update(reports).set({ updatedAt: new Date(), updatedBy: user.id }).where(eq(reports.id, reportId));

  return json({ ok: true });
};

export const config: Config = {
  path: "/api/reports/:id/images/:imageId",
  method: "DELETE",
};
