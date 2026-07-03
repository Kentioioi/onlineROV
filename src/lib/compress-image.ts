const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;

/**
 * Downscales/re-encodes a photo to JPEG in the browser before upload.
 * This is load-bearing, not an optimization:
 * - Netlify Functions reject request bodies over 6MB, and raw phone camera
 *   photos are routinely 5-12MB - without this, mobile uploads fail at the
 *   platform layer before our code ever runs ("photos not showing").
 * - iPhone HEIC photos can't be decoded by the server-side resizer (Jimp);
 *   Safari CAN decode HEIC into a canvas, so re-encoding client-side
 *   normalizes them to JPEG where it's actually possible.
 * - Smaller blobs also shrink the offline IndexedDB outbox and upload time
 *   over weak boat connections (both called out in the offline plan).
 *
 * Falls back to the original file if decoding fails (e.g. HEIC dropped on
 * desktop Chrome) - the server then returns a clear error instead of us
 * silently dropping the photo here.
 */
export async function compressImageForUpload(file: File): Promise<{ blob: Blob; filename: string; contentType: string }> {
  try {
    const bitmap = await loadBitmap(file);
    const width = "width" in bitmap ? bitmap.width : 0;
    const height = "height" in bitmap ? bitmap.height : 0;
    if (!width || !height) throw new Error("could not read image dimensions");

    const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas context");
    ctx.drawImage(bitmap, 0, 0, w, h);
    if ("close" in bitmap) bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (!blob || blob.size === 0) throw new Error("canvas encode failed");

    const filename = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return { blob, filename, contentType: "image/jpeg" };
  } catch {
    return { blob: file, filename: file.name, contentType: file.type };
  }
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      // imageOrientation honors EXIF rotation so portrait phone photos
      // don't come out sideways after the canvas re-encode.
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Format not decodable via createImageBitmap - try <img> below.
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}
