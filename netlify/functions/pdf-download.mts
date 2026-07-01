import type { Config, Context } from "@netlify/functions";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { reports } from "../../db/schema.js";
import { getReportStore } from "./_shared/blobs.js";
import { resolveUser, unauthorized } from "./_shared/auth.js";
import { notFound } from "./_shared/http.js";

// Same sanitization convention as the legacy desktop app's
// generate_pdf_path(): illegal Windows filename chars -> underscore.
function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, "_").trim();
}

export default async (req: Request, context: Context) => {
  const user = await resolveUser();
  if (!user) return unauthorized();

  const { id } = context.params;
  const [report] = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
  if (!report) return notFound("Rapport ikke funnet");
  if (!report.pdfBlobKey) return notFound("PDF er ikke generert ennå for denne rapporten");

  const blob = await getReportStore().get(report.pdfBlobKey, { type: "blob" });
  if (!blob) return notFound("PDF-fil mangler i lagring");

  const filename = sanitizeFilename(
    `${report.location ?? ""} ${report.merdNumber ?? ""} ${report.reason ?? ""} ${report.date}.pdf`.replace(/\s+/g, " "),
  );

  return new Response(blob, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
};

export const config: Config = {
  path: "/api/reports/:id/pdf/download",
  method: "GET",
};
