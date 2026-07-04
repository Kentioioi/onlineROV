-- The previous attempt (ALTER TYPE ... ADD VALUE + seed in separate files)
-- failed with 55P04: Netlify's runner applies all pending migrations in ONE
-- transaction, and Postgres forbids using an enum value added in the same
-- transaction. Root fix: field_key becomes plain text - the set of valid
-- keys is enforced app-side (shared/schema.ts FIELD_KEYS zod enum), and new
-- categories no longer require enum surgery. All statements below are
-- transaction-safe together.

-- USING is required: Postgres has no implicit enum->text cast in
-- ALTER COLUMN TYPE.
ALTER TABLE "field_options" ALTER COLUMN "field_key" TYPE text USING "field_key"::text;

DROP TYPE "field_key";

INSERT INTO "field_options" ("field_key", "value", "sort_order") VALUES
  ('condition_unchecked', 'N/A', 0)
ON CONFLICT ("field_key", "value") DO NOTHING;
