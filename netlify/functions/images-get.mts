import type { Config, Context } from "@netlify/functions";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { reportImages } from "../../db/schema.js";
import { getReportStore } from "./_shared/blobs.js";
import { resolveUser, unauthorized } from "./_shared/auth.js";
import { notFound } from "./_shared/http.js";

// Netlify Blobs has no public-URL primitive, so serving an image back to the
// browser goes through this authenticated proxy rather than a direct link.
export default async (req: Request, context: Context) => {
  const user = await resolveUser();
  if (!user) return unauthorized();

  const { imageId } = context.params;
  const [row] = await db.select().from(reportImages).where(eq(reportImages.id, imageId)).limit(1);
  if (!row) return notFound("Bilde ikke funnet");

  const blob = await getReportStore().get(row.blobKey, { type: "blob" });
  if (!blob) return notFound("Bilde ikke funnet");

  return new Response(blob, {
    headers: {
      "content-type": row.contentType ?? "image/jpeg",
      "cache-control": "private, max-age=86400",
    },
  });
};

export const config: Config = {
  path: "/api/images/:imageId",
  method: "GET",
};
