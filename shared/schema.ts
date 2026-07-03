import { z } from "zod";
import { INSPECTION_CATEGORIES, IMAGE_CATEGORIES, FIELD_KEYS } from "./constants.js";

// Shared between the frontend form (react-hook-form + zodResolver) and the
// Netlify Functions (defense-in-depth re-validation server-side) - the
// contract for what a client sends when creating/updating a report. Server-
// managed fields (report_number, created_at/updated_at, created_by/updated_by,
// pdf_blob_key/pdf_generated_at) are deliberately absent here.

export const inspectionResultInputSchema = z.object({
  category: z.enum(INSPECTION_CATEGORIES),
  checked: z.boolean(),
  condition: z.string().nullable().optional(),
  comment: z.string().nullable().optional(),
});
export type InspectionResultInput = z.infer<typeof inspectionResultInputSchema>;

// Postgres `date`/`time` columns reject malformed strings with an error the
// API surfaced as a 500 - validate the shape here so bad values become a
// clear 400 instead. Time accepts "HH:MM" or "HH:MM:SS" (what <input
// type=time> produces).
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Dato må være på formen ÅÅÅÅ-MM-DD");
const timeOfDay = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Tid må være på formen TT:MM")
  .nullable()
  .optional();

export const reportInputSchema = z.object({
  // Client-generated uuid - the offline-sync idempotency key (see plan).
  id: z.uuid(),
  date: isoDate,
  vessel: z.string().nullable().optional(),
  timeFrom: timeOfDay,
  timeTo: timeOfDay,
  projectLeader: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  rovOperator: z.string().nullable().optional(),
  reason: z.string().nullable().optional(),

  merdNumber: z.string().nullable().optional(),
  merdType: z.string().nullable().optional(),
  sizeX: z.number().positive().nullable().optional(),
  sizeY: z.number().positive().nullable().optional(),
  depth: z.number().positive().nullable().optional(),
  deadFishCount: z.number().int().nonnegative().nullable().optional(),
  deadFishApprox: z.boolean().default(false),
  currentStrength: z.string().nullable().optional(),
  visibility: z.string().nullable().optional(),
  wildFish: z.string().nullable().optional(),
  wildFishNote: z.string().nullable().optional(),
  growth: z.string().nullable().optional(),

  comments: z.string().nullable().optional(),

  // Always exactly 5 rows, one per fixed category. Uniqueness enforced here
  // too - a duplicated category would otherwise hit the DB's unique
  // constraint and surface as a 500 instead of a 400.
  inspectionResults: z
    .array(inspectionResultInputSchema)
    .length(5)
    .refine((rows) => new Set(rows.map((r) => r.category)).size === rows.length, {
      message: "Hver inspeksjonskategori kan bare forekomme én gang",
    }),
});
export type ReportInput = z.infer<typeof reportInputSchema>;

// Soft-validation: at least one of these three must be filled, mirroring
// models.required_fields_missing() from the legacy app. This is checked
// separately (not via .refine on the schema above) so it can be surfaced as
// a dismissible warning rather than a hard schema failure - see plan's
// "Client-side validation rules" section.
export function softValidationWarnings(input: Partial<ReportInput>): string[] {
  const warnings: string[] = [];
  if (!input.location?.trim() && !input.reason?.trim() && !input.merdNumber?.trim()) {
    warnings.push("Ingen av Lokalitet, Grunn for inspeksjon eller Merd nummer er fylt ut.");
  }
  return warnings;
}

export const reportImageMetaSchema = z.object({
  id: z.uuid(),
  category: z.enum(IMAGE_CATEGORIES),
  originalFilename: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  sortOrder: z.number().int().nonnegative().default(0),
});
export type ReportImageMeta = z.infer<typeof reportImageMetaSchema>;

export const fieldOptionInputSchema = z.object({
  fieldKey: z.enum(FIELD_KEYS),
  value: z.string().trim().min(1, "Verdi kan ikke være tom"),
});
export type FieldOptionInput = z.infer<typeof fieldOptionInputSchema>;

export const maskebruddInputSchema = z
  .object({
    sizeX: z.number().int().positive(),
    sizeY: z.number().int().positive(),
    depth: z.number().positive(),
    escapeRisk: z.boolean().nullable(),
  })
  .refine((v) => (v.sizeX > 2 || v.sizeY > 2 ? v.escapeRisk !== null : true), {
    message: "Rømningsfare må velges når størrelsen er over 2x2",
    path: ["escapeRisk"],
  });
export type MaskebruddInput = z.infer<typeof maskebruddInputSchema>;

export function formatMaskebruddText(v: MaskebruddInput): string {
  const escapeSuffix =
    v.sizeX > 2 || v.sizeY > 2
      ? v.escapeRisk
        ? ""
        : ", Ikke fare for rømming"
      : "";
  return `Maskebrudd: ${v.sizeX}x${v.sizeY}, Dybde: ${v.depth}m${escapeSuffix}`;
}
