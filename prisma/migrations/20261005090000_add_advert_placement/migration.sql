DO $$
BEGIN
  CREATE TYPE "advert_placement" AS ENUM ('HORIZONTAL', 'VERTICAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "advert_campaigns"
  ADD COLUMN IF NOT EXISTS "placement" "advert_placement" NOT NULL DEFAULT 'HORIZONTAL';

CREATE INDEX IF NOT EXISTS "advert_campaigns_placement_lookup_idx"
  ON "advert_campaigns" ("placement", "status", "starts_at", "expires_at", "visibility_score", "created_at");