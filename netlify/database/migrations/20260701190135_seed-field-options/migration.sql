-- Seed data for the report_number_counter singleton row (required for the
-- atomic UPDATE ... WHERE id = 1 RETURNING pattern in reports-create to have
-- a row to update at all) and the initial field_options values, sourced from
-- real historical data in the legacy desktop app (data/memory.json /
-- config.py) plus the standard values confirmed with the user. Every row
-- here is an ordinary, user-deletable field_options row - there is no
-- "system default" distinction, matching the plan's design.

INSERT INTO "report_number_counter" ("id", "next_value") VALUES (1, 1)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "field_options" ("field_key", "value", "sort_order") VALUES
  ('location', 'Borgarli', 0),
  ('location', 'Dale', 1),
  ('location', 'Rennaren', 2),

  ('vessel', 'Hydra', 0),

  ('project_leader', 'Andres Tveit', 0),

  ('rov_operator', 'Andreii Sidorov', 0),
  ('rov_operator', 'Kenneth Jansen', 1),

  ('merd_type', 'Rettevegget', 0),

  ('reason', 'Før behandling', 0),
  ('reason', 'Etter behandling', 1),
  ('reason', 'Ny not', 2),

  ('current_strength', 'Ingen', 0),
  ('current_strength', 'Svak', 1),
  ('current_strength', 'Moderat', 2),
  ('current_strength', 'Sterk', 3),

  ('visibility', 'Dårlig', 0),
  ('visibility', 'Grei', 1),
  ('visibility', 'God', 2),
  ('visibility', 'Meget god', 3),

  ('wild_fish', 'Ikke observert', 0),
  ('wild_fish', 'Observert', 1),

  ('growth', 'Ingen', 0),
  ('growth', 'Lite', 1),
  ('growth', 'Moderat', 2),
  ('growth', 'Mye', 3),

  ('condition', 'Ok', 0),
  ('condition', 'Mindre avvik', 1),
  ('condition', 'Avvik', 2),
  ('condition', 'Kritisk', 3),
  ('condition', 'N/A', 4),

  ('escalation_contact', 'Prosjektleder', 0),
  ('escalation_contact', 'Operasjonsleder', 1),
  ('escalation_contact', 'Lokalitetsansvarlig', 2)
ON CONFLICT ("field_key", "value") DO NOTHING;
