import type { Config, Context } from "@netlify/functions";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { reportImages, reports } from "../../db/schema.js";
import { ACCEPTED_IMAGE_TYPES, IMAGE_CATEGORIES, MAX_IMAGE_SIZE_BYTES } from "../../shared/constants.js";
import { getReportStore, imageBlobKey } from "./_shared/blobs.js";
import { resizeForStorage } from "./_shared/image.js";
import { resolveUser, unauthorized } from "./_shared/auth.js";
import { badRequest, json, notFound } from "./_shared/http.js";
import { z } from "zod";

const metaSchema = z.object({
  id: z.uuid(),
  category: z.enum(IMAGE_CATEGORIES),
  sortOrder: z.coerce.number().int().nonnegative().default(0),
});

export default async (req: Request, context: Context) => {
  const user = await resolveUser();
  if (!user) return unauthorized();

  const { id: reportId } = context.params;
  const [report] = await db.select({ id: reports.id }).from(reports).where(eq(reports.id, reportId)).limit(1);
  if (!report) return notFound("Rapport ikke funnet");

  const form = await req.formData().catch(() => null);
  if (!form) return badRequest("Forventet multipart/form-data");

  const parsed = metaSchema.safeParse({
    id: form.get("id"),
    category: form.get("category"),
    sortOrder: form.get("sortOrder") ?? undefined,
  });
  if (!parsed.success) return badRequest("Ugyldige bildemetadata", parsed.error.flatten());
  const { id: imageId, category, sortOrder } = parsed.data;

  const file = form.get("file");
  if (!(file instanceof File)) return badRequest("Mangler fil");
  if (file.size > MAX_IMAGE_SIZE_BYTES) return badRequest("Filen er for stor (maks 15MB)");
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) return badRequest(`Filtype ${file.type} støttes ikke`);

  const originalBytes = await file.arrayBuffer();
  const { buffer, contentType } = await resizeForStorage(originalBytes);

  const blobKey = imageBlobKey(reportId, category, imageId, "jpg");
  const store = getReportStore();
  // Netlify Blobs set() is a pure overwrite-by-key - a retried upload with
  // the same client-generated imageId is naturally idempotent at the
  // storage layer, no duplicate-detection logic needed here.
  await store.set(blobKey, buffer, {
    metadata: { contentType, uploadedAt: new Date().toISOString(), reportId },
  });

  const [row] = await db
    .insert(reportImages)
    .values({
      id: imageId,
      reportId,
      category,
      blobKey,
      originalFilename: file.name,
      contentType,
      sizeBytes: buffer.byteLength,
      sortOrder,
    })
    .onConflictDoUpdate({
      target: reportImages.id,
      set: { category, blobKey, originalFilename: file.name, contentType, sizeBytes: buffer.byteLength, sortOrder },
    })
    .returning();

  return json(row, { status: 201 });
};

export const config: Config = {
  path: "/api/reports/:id/images",
  method: "POST",
};
