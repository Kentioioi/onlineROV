import { Jimp, JimpMime } from "jimp";

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 85;

/** Thrown when the uploaded bytes aren't a format Jimp can decode
 * (e.g. HEIC or WebP) - callers turn this into a 400 with a clear message
 * instead of a bare 500. The client normally re-encodes to JPEG before
 * upload, so this only fires for its fallback path. */
export class UnsupportedImageError extends Error {
  constructor() {
    super("Unsupported image format");
  }
}

/**
 * Re-encodes an uploaded image to a print-safe resolution/JPEG quality
 * before it ever reaches Blobs - required, not optional, to stay inside the
 * 1024MB/60s Netlify Function ceiling once a PDF embeds several of these.
 * Pure-JS (no native bindings) so it bundles predictably in the Functions
 * build, at the cost of being slower than sharp - an acceptable tradeoff
 * for report photos at this volume (a handful of reports/week).
 */
export async function resizeForStorage(input: ArrayBuffer): Promise<{ buffer: Buffer; contentType: string }> {
  let image;
  try {
    image = await Jimp.fromBuffer(input);
  } catch {
    throw new UnsupportedImageError();
  }
  if (image.width > MAX_DIMENSION || image.height > MAX_DIMENSION) {
    if (image.width >= image.height) {
      image.resize({ w: MAX_DIMENSION });
    } else {
      image.resize({ h: MAX_DIMENSION });
    }
  }
  const buffer = await image.getBuffer(JimpMime.jpeg, { quality: JPEG_QUALITY });
  return { buffer, contentType: "image/jpeg" };
}
