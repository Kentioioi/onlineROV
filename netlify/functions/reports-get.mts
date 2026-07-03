import type { Config, Context } from "@netlify/functions";
import { asc, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { inspectionResults, reportImages, reports } from "../../db/schema.js";
import { resolveUser, unauthorized } from "./_shared/auth.js";
import { isUuid, json, notFound } from "./_shared/http.js";

export default async (req: Request, context: Context) => {
  const user = await resolveUser();
  if (!user) return unauthorized();

  const { id } = context.params;
  if (!isUuid(id)) return notFound("Rapport ikke funnet");

  const [report, results, images] = await Promise.all([
    db.select().from(reports).where(eq(reports.id, id)).limit(1),
    db
      .select()
      .from(inspectionResults)
      .where(eq(inspectionResults.reportId, id)),
    db
      .select()
      .from(reportImages)
      .where(eq(reportImages.reportId, id))
      .orderBy(asc(reportImages.category), asc(reportImages.sortOrder)),
  ]);

  if (!report[0]) return notFound("Rapport ikke funnet");

  return json({
    ...report[0],
    inspectionResults: results,
    images,
  });
};

export const config: Config = {
  path: "/api/reports/:id",
  method: "GET",
};
