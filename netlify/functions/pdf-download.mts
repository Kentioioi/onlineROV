import type { Config, Context } from "@netlify/functions";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { reports } from "../../db/schema.js";
import { getReportStore } from "./_shared/blobs.js";
import { resolveUser, unauthorized } from "./_shared/auth.js";
import { isUuid, notFound } from "./_shared/http.js";
import { formatDateNo } from "../../shared/format.js";

// Same sanitization convention as the legacy desktop app's
// generate_pdf_path(): illegal Windows filename chars -> underscore.
function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, "_").trim();
}

// HTTP header values are ByteStrings - any code unit above U+00FF (curly
// quotes/dashes from phone smart-punctuation, emoji) makes the Response
// constructor throw, which 500'd every download for that report (audit
// finding). Latin-1 chars like æøå are fine and kept. The full UTF-8 name
// is carried in the RFC 5987 filename* parameter, which modern browsers
// prefer, so non-Latin-1 names still download correctly.
function contentDisposition(filename: string): string {
  const latin1Fallback = filename.replace(/[^\x20-\xFF]/g, "_").replace(/"/g, "_");
  const utf8 = encodeURIComponent(filename).replace(/['()]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
  return `attachment; filename="${latin1Fallback}"; filename*=UTF-8''${utf8}`;
}

export default async (req: Request, context: Context) => {
  const user = await resolveUser();
  if (!user) return unauthorized();

  const { id } = context.params;
  if (!isUuid(id)) return notFound("Rapport ikke funnet");
  const [report] = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
  if (!report) return notFound("Rapport ikke funnet");
  if (!report.pdfBlobKey) return notFound("PDF er ikke generert ennå for denne rapporten");

  const blob = await getReportStore().get(report.pdfBlobKey, { type: "blob" });
  if (!blob) return notFound("PDF-fil mangler i lagring");

  const filename = sanitizeFilename(
    `${report.location ?? ""} ${report.merdNumber ?? ""} ${report.reason ?? ""} ${formatDateNo(report.date)}.pdf`.replace(/\s+/g, " "),
  );

  return new Response(blob, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": contentDisposition(filename),
    },
  });
};

export const config: Config = {
  path: "/api/reports/:id/pdf/download",
  method: "GET",
};
