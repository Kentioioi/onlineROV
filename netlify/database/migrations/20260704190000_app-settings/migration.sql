-- Single-value user-editable settings (per-category inspection defaults
-- etc.) - field_options can't hold these cleanly (its unique key is
-- (field_key, value), i.e. list semantics, not one-value-per-key).
CREATE TABLE "app_settings" (
  "key" text PRIMARY KEY,
  "value" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
