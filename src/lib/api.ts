import type { FieldOption, Report, ReportImage, InspectionResult } from "../../db/schema";
import type { FieldKey } from "../../shared/constants";
import type { ReportInput } from "../../shared/schema";

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// A real 401 from our own API is the one authoritative "session is dead"
// signal - AuthProvider listens for this, clears the trusted session, and
// tells the user explicitly instead of every request quietly failing.
// (Network failures throw TypeError before reaching here and are NOT
// logouts - being offline must never kick the user out.)
function notifyUnauthorized(): void {
  window.dispatchEvent(new Event("auth:unauthorized"));
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { ...(init?.body && !(init.body instanceof FormData) ? { "content-type": "application/json" } : {}), ...init?.headers },
  });
  if (!res.ok) {
    if (res.status === 401) notifyUnauthorized();
    let body: { error?: string; details?: unknown } = {};
    try {
      body = await res.json();
    } catch {
      // non-JSON error body, fall through with generic message
    }
    throw new ApiError(res.status, body.error ?? res.statusText, body.details);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export type ReportSummary = Pick<
  Report,
  "id" | "reportNumber" | "date" | "location" | "merdNumber" | "reason" | "rovOperator" | "vessel" | "pdfBlobKey" | "createdAt"
>;

export type ReportListResult = { items: ReportSummary[]; total: number; page: number; pageSize: number };

export type ReportDetail = Report & { inspectionResults: InspectionResult[]; images: ReportImage[] };

export type ReportListFilters = {
  page?: number;
  pageSize?: number;
  dateFrom?: string;
  dateTo?: string;
  location?: string;
  merdNumber?: string;
  rovOperator?: string;
  q?: string;
};

export function listReports(filters: ReportListFilters = {}): Promise<ReportListResult> {
  const params = new URLSearchParams();
  if (filters.page) params.set("page", String(filters.page));
  if (filters.pageSize) params.set("page_size", String(filters.pageSize));
  if (filters.dateFrom) params.set("date_from", filters.dateFrom);
  if (filters.dateTo) params.set("date_to", filters.dateTo);
  if (filters.location) params.set("location", filters.location);
  if (filters.merdNumber) params.set("merd_number", filters.merdNumber);
  if (filters.rovOperator) params.set("rov_operator", filters.rovOperator);
  if (filters.q) params.set("q", filters.q);
  return apiFetch(`/api/reports?${params.toString()}`);
}

export function getReport(id: string): Promise<ReportDetail> {
  return apiFetch(`/api/reports/${id}`);
}

/**
 * isNew=false means the report already existed server-side (idempotent
 * retry) and the returned row is the EXISTING data - the payload was NOT
 * applied. Callers with fresher local edits must follow up with updateReport.
 */
export function createReport(input: ReportInput): Promise<ReportDetail & { isNew: boolean }> {
  return apiFetch(`/api/reports`, { method: "POST", body: JSON.stringify(input) });
}

export function updateReport(id: string, input: ReportInput): Promise<ReportDetail> {
  return apiFetch(`/api/reports/${id}`, { method: "PUT", body: JSON.stringify(input) });
}

export function deleteReport(id: string): Promise<{ ok: true }> {
  return apiFetch(`/api/reports/${id}`, { method: "DELETE" });
}

export function uploadImage(
  reportId: string,
  args: { id: string; category: string; file: Blob; filename: string; sortOrder?: number },
): Promise<ReportImage> {
  const form = new FormData();
  form.set("id", args.id);
  form.set("category", args.category);
  form.set("sortOrder", String(args.sortOrder ?? 0));
  form.set("file", args.file, args.filename);
  return apiFetch(`/api/reports/${reportId}/images`, { method: "POST", body: form });
}

export function deleteImage(reportId: string, imageId: string): Promise<{ ok: true }> {
  return apiFetch(`/api/reports/${reportId}/images/${imageId}`, { method: "DELETE" });
}

export function imageUrl(imageId: string): string {
  return `/api/images/${imageId}`;
}

export function generatePdf(reportId: string): Promise<{ downloadUrl: string; generatedAt: string }> {
  return apiFetch(`/api/reports/${reportId}/pdf`, { method: "POST" });
}

export function pdfDownloadUrl(reportId: string): string {
  return `/api/reports/${reportId}/pdf/download`;
}

function filenameFromContentDisposition(header: string | null, fallback: string): string {
  const match = header?.match(/filename="([^"]+)"/);
  return match?.[1] ?? fallback;
}

/**
 * Downloads the PDF via fetch + blob instead of a raw `<a href>` full-page
 * navigation. A plain navigation to an authenticated API route is fragile in
 * an SPA (any hiccup - auth cookie edge case, the SPA fallback redirect
 * matching before the function route, etc. - lands the browser back on
 * index.html instead of downloading anything, which is exactly the "just
 * takes me to the starting page" symptom). Routing the download through the
 * same fetch() path every other authenticated call already uses avoids that
 * whole class of failure and never navigates the page at all.
 */
export async function downloadPdf(reportId: string): Promise<void> {
  const res = await fetch(pdfDownloadUrl(reportId));
  if (!res.ok) {
    if (res.status === 401) notifyUnauthorized();
    let message = res.statusText;
    try {
      message = (await res.json()).error ?? message;
    } catch {
      // non-JSON error body, fall through with generic message
    }
    throw new ApiError(res.status, message);
  }
  const blob = await res.blob();
  const filename = filenameFromContentDisposition(res.headers.get("content-disposition"), `rapport-${reportId}.pdf`);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function listFieldOptions(field?: FieldKey): Promise<{ items: FieldOption[] }> {
  const qs = field ? `?field=${encodeURIComponent(field)}` : "";
  return apiFetch(`/api/field-options${qs}`);
}

export function addFieldOption(fieldKey: FieldKey, value: string): Promise<FieldOption> {
  return apiFetch(`/api/field-options`, { method: "POST", body: JSON.stringify({ fieldKey, value }) });
}

export function deleteFieldOption(id: number): Promise<{ ok: true }> {
  return apiFetch(`/api/field-options/${id}`, { method: "DELETE" });
}
