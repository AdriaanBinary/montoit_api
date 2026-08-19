INSERT INTO "general_fees" ("name") VALUES
  ('Levies'),
  ('Property rates'),
  ('Sewage'),
  ('Agency commission'),
  ('Deposit'),
  ('Application fee')
ON CONFLICT ("name") DO NOTHING;
