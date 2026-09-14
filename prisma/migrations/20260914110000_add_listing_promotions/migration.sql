DO $$
BEGIN
  CREATE TYPE "listing_promotion_type" AS ENUM ('FEATURED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "listing_promotion_status" AS ENUM ('ACTIVE', 'CANCELLED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "listing_promotions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "listing_id" INTEGER NOT NULL,
  "user_id" VARCHAR(16) NOT NULL,
  "package_id" INTEGER NOT NULL,
  "type" "listing_promotion_type" NOT NULL,
  "status" "listing_promotion_status" NOT NULL DEFAULT 'ACTIVE',
  "starts_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "listing_promotions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "listing_impressions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "listing_id" INTEGER NOT NULL,
  "promotion_id" UUID,
  "search_request_id" VARCHAR(100),
  "viewer_id" VARCHAR(16),
  "anonymous_session_id" VARCHAR(100),
  "position" INTEGER,
  "was_featured" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "listing_impressions_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  ALTER TABLE "listing_promotions" ADD CONSTRAINT "listing_promotions_listing_id_fkey"
    FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE;
  ALTER TABLE "listing_promotions" ADD CONSTRAINT "listing_promotions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT;
  ALTER TABLE "listing_promotions" ADD CONSTRAINT "listing_promotions_package_id_fkey"
    FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE RESTRICT;
  ALTER TABLE "listing_impressions" ADD CONSTRAINT "listing_impressions_listing_id_fkey"
    FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE;
  ALTER TABLE "listing_impressions" ADD CONSTRAINT "listing_impressions_promotion_id_fkey"
    FOREIGN KEY ("promotion_id") REFERENCES "listing_promotions"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "listing_promotions_active_lookup_idx"
  ON "listing_promotions" ("listing_id", "type", "status", "starts_at", "expires_at");
CREATE INDEX IF NOT EXISTS "listing_promotions_user_month_idx"
  ON "listing_promotions" ("user_id", "created_at", "type", "status");
CREATE INDEX IF NOT EXISTS "listing_impressions_promotion_created_idx"
  ON "listing_impressions" ("promotion_id", "created_at");