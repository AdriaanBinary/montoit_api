ALTER TABLE "listings"
  ADD COLUMN IF NOT EXISTS "rights_confirmed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "rights_confirmed_at" TIMESTAMPTZ(6);
