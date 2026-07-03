import type { Config, Context } from "@netlify/functions";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { reportImages, reports } from "../../db/schema.js";
import { ACCEPTED_IMAGE_TYPES, IMAGE_CATEGORIES, MAX_IMAGE_SIZE_BYTES } from "../../shared/constants.js";
import { getReportStore, imageBlobKey } from "./_shared/blobs.js";
import { resizeForStorage, UnsupportedImageError } from "./_shared/image.js";
import { resolveUser, unauthorized } from "./_shared/auth.js";
import { badRequest, isUuid, json, notFound } from "./_shared/http.js";
import { z } from "zod";

const metaSchema = z.object({
  id: z.uuid(),
  category: z.enum(IMAGE_CATEGORIES),
  sortOrder: z.coerce.number().int().nonnegative().max(100_000).default(0),
});

export default async (req: Request, context: Context) => {
  const user = await resolveUser();
  if (!user) return unauthorized();

  const { id: reportId } = context.params;
  if (!isUuid(reportId)) return notFound("Rapport ikke funnet");
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
  let buffer: Buffer;
  let contentType: string;
  try {
    ({ buffer, contentType } = await resizeForStorage(originalBytes));
  } catch (err) {
    if (err instanceof UnsupportedImageError) {
      return badRequest("Bildeformatet støttes ikke - bruk JPEG eller PNG");
    }
    throw err;
  }

  // The upsert-on-id retry path must stay scoped to THIS report - without
  // this check, re-sending an image id that already belongs to a different
  // report would silently rebind that report's image (audit finding).
  const [existingImage] = await db
    .select({ reportId: reportImages.reportId })
    .from(reportImages)
    .where(eq(reportImages.id, imageId))
    .limit(1);
  if (existingImage && existingImage.reportId !== reportId) {
    return badRequest("Bilde-id tilhører en annen rapport");
  }

  const blobKey = imageBlobKey(reportId, category, imageId, "jpg");
  const store = getReportStore();
  // Netlify Blobs set() is a pure overwrite-by-key - a retried upload with
  // the same client-generated imageId is naturally idempotent at the
  // storage layer, no duplicate-detection logic needed here.
  await store.set(blobKey, buffer, {
    metadata: { contentType, uploadedAt: new Date().toISOString(), reportId },
  });

  let row;
  try {
    [row] = await db
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
  } catch (err) {
    // The report existed at the check above but was deleted while the blob
    // was uploading (offline photo sync racing a delete) - the insert hits
    // the FK. Clean up the just-written blob and answer 404 rather than 500,
    // so the offline outbox treats it as a permanent rejection, not a retry.
    await store.delete(blobKey).catch(() => undefined);
    const isFkViolation = err instanceof Error && "code" in err && (err as { code?: string }).code === "23503";
    if (isFkViolation) return notFound("Rapport ikke funnet");
    throw err;
  }

  // Photo changes are report changes - without this, the detail page's
  // "PDF is stale" warning missed reports whose only edit was photos.
  await db.update(reports).set({ updatedAt: new Date(), updatedBy: user.id }).where(eq(reports.id, reportId));

  return json(row, { status: 201 });
};

export const config: Config = {
  path: "/api/reports/:id/images",
  method: "POST",
};
