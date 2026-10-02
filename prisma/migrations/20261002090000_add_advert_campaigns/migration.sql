DO $$
BEGIN
  CREATE TYPE "advert_campaign_status" AS ENUM ('DRAFT', 'PENDING_PAYMENT', 'ACTIVE', 'PAUSED', 'EXPIRED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "advert_payment_status" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "advert_campaigns" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" VARCHAR(16) NOT NULL,
  "image_object_key" TEXT NOT NULL,
  "destination_url" TEXT,
  "duration_months" INTEGER NOT NULL,
  "price" DECIMAL(12,2) NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'XAF',
  "status" "advert_campaign_status" NOT NULL DEFAULT 'DRAFT',
  "starts_at" TIMESTAMPTZ(6),
  "expires_at" TIMESTAMPTZ(6),
  "impressions" BIGINT NOT NULL DEFAULT 0,
  "clicks" BIGINT NOT NULL DEFAULT 0,
  "visibility_score" INTEGER NOT NULL DEFAULT 70,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "advert_campaigns_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "advert_campaigns_duration_months_check" CHECK ("duration_months" IN (1, 3, 6, 12, 24)),
  CONSTRAINT "advert_campaigns_price_check" CHECK ("price" >= 0),
  CONSTRAINT "advert_campaigns_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "advert_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "advert_id" UUID NOT NULL,
  "event_type" VARCHAR(20) NOT NULL,
  "viewer_id" VARCHAR(16),
  "anonymous_session_id" VARCHAR(100),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "advert_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "advert_events_type_check" CHECK ("event_type" IN ('IMPRESSION', 'CLICK')),
  CONSTRAINT "advert_events_advert_id_fkey" FOREIGN KEY ("advert_id") REFERENCES "advert_campaigns"("id") ON DELETE CASCADE,
  CONSTRAINT "advert_events_viewer_id_fkey" FOREIGN KEY ("viewer_id") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "advert_campaigns_public_lookup_idx"
  ON "advert_campaigns" ("status", "starts_at", "expires_at", "visibility_score", "created_at");
CREATE INDEX IF NOT EXISTS "advert_campaigns_owner_lookup_idx"
  ON "advert_campaigns" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "advert_events_advert_type_created_idx"
  ON "advert_events" ("advert_id", "event_type", "created_at");

CREATE TABLE IF NOT EXISTS "advert_payments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "advert_id" UUID NOT NULL,
  "user_id" VARCHAR(16) NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'XAF',
  "provider_reference" VARCHAR(255) NOT NULL UNIQUE,
  "provider_transaction_id" VARCHAR(255),
  "checkout_url" TEXT,
  "status" "advert_payment_status" NOT NULL DEFAULT 'PENDING',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paid_at" TIMESTAMPTZ(6),
  CONSTRAINT "advert_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "advert_payments_advert_id_fkey" FOREIGN KEY ("advert_id") REFERENCES "advert_campaigns"("id") ON DELETE CASCADE,
  CONSTRAINT "advert_payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "advert_payments_advert_lookup_idx"
  ON "advert_payments" ("advert_id", "status", "created_at");
