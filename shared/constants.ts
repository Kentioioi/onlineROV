// Single source of truth for the fixed inspection categories, image
// categories, and field_options keys - imported by both the frontend (src/)
// and the Netlify Functions (netlify/functions/) via plain relative paths,
// since the bundler that packages Functions does not resolve the "@/*" Vite
// alias. Mirrors rov_inspector/constants.py's CATEGORIES tuple.

export const INSPECTION_CATEGORIES = [
  "liftup",
  "lodd",
  "bunn",
  "not",
  "opphalere",
] as const;
export type InspectionCategory = (typeof INSPECTION_CATEGORIES)[number];

export const IMAGE_CATEGORIES = [...INSPECTION_CATEGORIES, "annet"] as const;
export type ImageCategory = (typeof IMAGE_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<ImageCategory, string> = {
  liftup: "Lift up",
  lodd: "Lodd",
  bunn: "Bunn",
  not: "Not",
  opphalere: "Opphalere",
  annet: "Annet",
};

// checked-state -> default Kommentar template, matching config.py's
// `results` (checked) / `results_unchecked` (not checked) maps exactly.
export const CHECKED_COMMENT_DEFAULTS: Record<InspectionCategory, string> = {
  liftup: "Liftup ligger i senter",
  lodd: "Alle spylelodd tilstede",
  bunn: "Bunnline henger jamt",
  not: "Nota er stram og fin",
  opphalere: "Alle opphalere tilstede",
};

export const UNCHECKED_COMMENT_DEFAULTS: Record<InspectionCategory, string> = {
  liftup: "Liftup ikke sjekket",
  lodd: "Lodd ikke sjekket",
  bunn: "Bunn ikke sjekket",
  not: "Notvegg ikke sjekket",
  opphalere: "Opphalere ikke sjekket",
};

export const CHECKED_CONDITION_DEFAULT = "Ok";
export const UNCHECKED_CONDITION_DEFAULT = "N/A";

// Keys for user-editable per-category inspection defaults in app_settings.
// The hardcoded maps above remain the fallback when no override is stored.
export type InspectionDefaultState = "checked" | "unchecked";
export type InspectionDefaultField = "condition" | "comment";

export function inspectionDefaultKey(
  state: InspectionDefaultState,
  fieldName: InspectionDefaultField,
  category: InspectionCategory,
): string {
  return `insp_${state}_${fieldName}_${category}`;
}

export function builtinInspectionDefault(
  state: InspectionDefaultState,
  fieldName: InspectionDefaultField,
  category: InspectionCategory,
): string {
  if (fieldName === "condition") return state === "checked" ? CHECKED_CONDITION_DEFAULT : UNCHECKED_CONDITION_DEFAULT;
  return state === "checked" ? CHECKED_COMMENT_DEFAULTS[category] : UNCHECKED_COMMENT_DEFAULTS[category];
}

// Prefilled starting text for the free-form Kommentarer/Avvik textarea on a
// new report - a text default, not a dropdown option list, so it's not
// subject to the "must be user-editable like field_options" rule (the user
// can freely edit/replace it same as the old app's default_comments).
export const DEFAULT_COMMENTS_TEXT = "-Ingen pigghå observert på utside.";

// field_options.field_key values - every standard-value dropdown/combobox
// in the app reads its options from field_options keyed by one of these.
export const FIELD_KEYS = [
  "location",
  "vessel",
  "project_leader",
  "rov_operator",
  "merd_type",
  "reason",
  "current_strength",
  "visibility",
  "wild_fish",
  "growth",
  "condition",
  "condition_unchecked",
] as const;
export type FieldKey = (typeof FIELD_KEYS)[number];

// Which field_key fields are "open-ended entity" fields (creatable combobox,
// add-inline while filling a report) vs "standardized scale" fields (plain
// select, list managed only via the Settings page) - per the plan's unified
// field_options design.
export const CREATABLE_FIELD_KEYS: FieldKey[] = [
  "location",
  "vessel",
  "project_leader",
  "rov_operator",
  "merd_type",
  "reason",
];

export const SELECT_ONLY_FIELD_KEYS: FieldKey[] = [
  "current_strength",
  "visibility",
  "wild_fish",
  "growth",
  "condition",
  "condition_unchecked",
];

export const FIELD_KEY_LABELS: Record<FieldKey, string> = {
  location: "Lokalitet",
  vessel: "Fartøy",
  project_leader: "Prosjektleder",
  rov_operator: "ROV Operatør",
  merd_type: "Merd type",
  reason: "Grunn for inspeksjon",
  current_strength: "Strøm",
  visibility: "Sikt",
  wild_fish: "Villfisk",
  growth: "Groe",
  condition: "Tilstand",
  condition_unchecked: "Tilstand (ikke sjekket)",
};

// Fields whose Settings chips can be starred as the standard (prefilled)
// value for new reports - every dropdown/combobox field qualifies.
export const DEFAULTABLE_FIELD_KEYS: FieldKey[] = [...FIELD_KEYS];

export function fieldDefaultKey(fieldKey: FieldKey): string {
  return `default_field_${fieldKey}`;
}

export const MAX_IMAGE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB original, before server-side resize
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/heic", "image/webp"];
