import type { Config, Context } from "@netlify/functions";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { reportImages } from "../../db/schema.js";
import { getReportStore } from "./_shared/blobs.js";
import { resolveUser, unauthorized } from "./_shared/auth.js";
import { json, notFound } from "./_shared/http.js";

export default async (req: Request, context: Context) => {
  const user = await resolveUser();
  if (!user) return unauthorized();

  const { id: reportId, imageId } = context.params;

  const [row] = await db
    .select()
    .from(reportImages)
    .where(and(eq(reportImages.id, imageId), eq(reportImages.reportId, reportId)))
    .limit(1);
  if (!row) return notFound("Bilde ikke funnet");

  await getReportStore().delete(row.blobKey);
  await db.delete(reportImages).where(eq(reportImages.id, imageId));

  return json({ ok: true });
};

export const config: Config = {
  path: "/api/reports/:id/images/:imageId",
  method: "DELETE",
};
