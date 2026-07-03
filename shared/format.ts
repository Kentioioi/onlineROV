// Reports store dates as ISO "YYYY-MM-DD" (sortable, unambiguous), but every
// user-facing surface - list, detail view, PDF, download filename - shows
// Norwegian "dd.mm.yyyy" like the legacy desktop app did.
export function formatDateNo(isoDate: string | null | undefined): string {
  if (!isoDate) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!match) return isoDate;
  return `${match[3]}.${match[2]}.${match[1]}`;
}
