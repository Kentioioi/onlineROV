import {
  boolean,
  check,
  integer,
  numeric,
  pgEnum,
  pgTable,
  serial,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// The 5 fixed inspection categories (never dynamic - mirrors rov_inspector/constants.py
// CATEGORIES where in_results=True). "not" = net wall, kept as the real Norwegian key.
export const inspectionCategoryEnum = pgEnum("inspection_category", [
  "liftup",
  "lodd",
  "bunn",
  "not",
  "opphalere",
]);

// Images additionally support "annet" (other/uncategorized) - image_label set
// from constants.py, one more entry than the inspection-results category set.
export const imageCategoryEnum = pgEnum("image_category", [
  "liftup",
  "lodd",
  "bunn",
  "not",
  "opphalere",
  "annet",
]);

// Every standard-value dropdown/combobox in the app reads its options from
// this one table (see plan: "field_options replaces both hardcoded enum and
// auto-derived autosuggest"). Seed rows and user-added rows are identical -
// all equally deletable, no "system default" flag.
export const fieldKeyEnum = pgEnum("field_key", [
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
  "escalation_contact",
]);

export const reports = pgTable("reports", {
  // Client-generated (crypto.randomUUID()) at "New report" time, not server
  // default - this is what makes offline creation + idempotent sync possible.
  // See netlify/functions/reports-create.mts for the ON CONFLICT (id) upsert.
  id: uuid("id").primaryKey(),

  // Only assigned once the create request actually reaches the server, via
  // the atomic report_number_counter below. Null is never stored here -
  // the row simply doesn't exist server-side until it has a number.
  reportNumber: integer("report_number").notNull().unique(),

  date: text("date").notNull(), // dd.mm.yyyy-independent: stored as ISO 'YYYY-MM-DD' text from <input type=date>
  vessel: text("vessel"),
  timeFrom: time("time_from"),
  timeTo: time("time_to"),
  projectLeader: text("project_leader"),
  location: text("location"), // Lokalitet
  rovOperator: text("rov_operator"),
  reason: text("reason"), // Grunn for inspeksjon

  merdNumber: text("merd_number"), // e.g. "M2", "R12345"
  merdType: text("merd_type"),
  sizeX: numeric("size_x"),
  sizeY: numeric("size_y"),
  depth: numeric("depth"),
  deadFishCount: integer("dead_fish_count"),
  deadFishApprox: boolean("dead_fish_approx").notNull().default(false), // "ca." modifier
  currentStrength: text("current_strength"), // Strøm
  visibility: text("visibility"), // Sikt
  wildFish: text("wild_fish"), // Villfisk
  wildFishNote: text("wild_fish_note"),
  growth: text("growth"), // Groe

  comments: text("comments"),

  createdBy: text("created_by"), // Identity user id, audit only
  updatedBy: text("updated_by"),

  pdfBlobKey: text("pdf_blob_key"),
  pdfGeneratedAt: timestamp("pdf_generated_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Always exactly 5 rows per report (one per fixed category) - enforced by
// application code on write, and by the unique constraint against duplicates.
export const inspectionResults = pgTable(
  "inspection_results",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    reportId: uuid("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    category: inspectionCategoryEnum("category").notNull(),
    checked: boolean("checked").notNull().default(true), // Status - a toggle, not free text
    condition: text("condition"), // Tilstand
    comment: text("comment"),
  },
  (t) => [unique("inspection_results_report_category_unique").on(t.reportId, t.category)],
);

export const reportImages = pgTable("report_images", {
  // Client-generated, also used to derive the deterministic Blob key
  // (reports/{reportId}/{imageId}.ext) - see plan's offline idempotency design.
  id: uuid("id").primaryKey(),
  reportId: uuid("report_id")
    .notNull()
    .references(() => reports.id, { onDelete: "cascade" }),
  category: imageCategoryEnum("category").notNull(),
  blobKey: text("blob_key").notNull().unique(),
  originalFilename: text("original_filename"),
  contentType: text("content_type"),
  sizeBytes: integer("size_bytes"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const fieldOptions = pgTable(
  "field_options",
  {
    id: serial("id").primaryKey(),
    fieldKey: fieldKeyEnum("field_key").notNull(),
    value: text("value").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("field_options_field_key_value_unique").on(t.fieldKey, t.value)],
);

// Single-row atomic counter. Incremented inside the same transaction as a
// report insert via `UPDATE ... SET next_value = next_value + 1 WHERE id = 1
// RETURNING next_value` - the standard Postgres pattern for a gapless-ish
// sequence that needs to be independently readable/reasonable (embedded in
// the PDF filename, etc.), which a plain SERIAL column doesn't give cleanly.
export const reportNumberCounter = pgTable(
  "report_number_counter",
  {
    id: smallint("id").primaryKey().default(1),
    nextValue: integer("next_value").notNull().default(1),
  },
  (t) => [check("report_number_counter_singleton", sql`${t.id} = 1`)],
);

export type Report = typeof reports.$inferSelect;
export type NewReport = typeof reports.$inferInsert;
export type InspectionResult = typeof inspectionResults.$inferSelect;
export type NewInspectionResult = typeof inspectionResults.$inferInsert;
export type ReportImage = typeof reportImages.$inferSelect;
export type NewReportImage = typeof reportImages.$inferInsert;
export type FieldOption = typeof fieldOptions.$inferSelect;
export type NewFieldOption = typeof fieldOptions.$inferInsert;
