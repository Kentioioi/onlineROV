import { getStore } from "@netlify/blobs";

// Single site-scoped store for both inspection photos and generated PDFs.
// Key convention: "reports/{reportId}/{category}/{imageId}.{ext}" for images,
// "pdfs/{year}/{month}/{reportId}.pdf" for PDFs (organized-by-date prefix for
// internal browsability; the user-facing download filename is separate, see
// pdf-download.mts).
export function getReportStore() {
  return getStore({ name: "rov-inspector" });
}

export function imageBlobKey(reportId: string, category: string, imageId: string, ext: string): string {
  return `reports/${reportId}/${category}/${imageId}.${ext}`;
}

export function pdfBlobKey(reportId: string, year: number, month: number): string {
  const monthPadded = String(month).padStart(2, "0");
  return `pdfs/${year}/${monthPadded}/${reportId}.pdf`;
}
