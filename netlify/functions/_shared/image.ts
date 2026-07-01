import { Jimp, JimpMime } from "jimp";

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 85;

/**
 * Re-encodes an uploaded image to a print-safe resolution/JPEG quality
 * before it ever reaches Blobs - required, not optional, to stay inside the
 * 1024MB/60s Netlify Function ceiling once a PDF embeds several of these.
 * Pure-JS (no native bindings) so it bundles predictably in the Functions
 * build, at the cost of being slower than sharp - an acceptable tradeoff
 * for report photos at this volume (a handful of reports/week).
 */
export async function resizeForStorage(input: ArrayBuffer): Promise<{ buffer: Buffer; contentType: string }> {
  const image = await Jimp.fromBuffer(input);
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
