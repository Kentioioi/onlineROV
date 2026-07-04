-- Seed the initial field_options value for the new condition_unchecked
-- field_key (Tilstand shown for unchecked inspection-result rows). Must be
-- its own migration, separate from the one that adds the enum value, since
-- Postgres forbids using a new enum value within the same transaction that
-- added it.

INSERT INTO "field_options" ("field_key", "value", "sort_order") VALUES
  ('condition_unchecked', 'N/A', 0)
ON CONFLICT ("field_key", "value") DO NOTHING;
