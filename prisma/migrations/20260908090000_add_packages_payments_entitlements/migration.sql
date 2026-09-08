-- Add package and payment infrastructure to the existing production schema.
-- Earlier migrations already create users and agencies; this migration adds
-- the application table needed by payment records.

DO $$
BEGIN
  CREATE TYPE "package_customer_type" AS ENUM ('PRIVATE', 'AGENCY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "package_billing_period" AS ENUM ('ONE_TIME', 'MONTHLY', 'YEARLY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "package_feature_value_type" AS ENUM ('BOOLEAN', 'INTEGER', 'DECIMAL', 'TEXT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "payment_status" AS ENUM ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'CANCELLED', 'REFUNDED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "payment_method" AS ENUM ('CARD', 'MOBILE_MONEY', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "entitlement_status" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "agency_application_status" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "packages" (
  "id" SERIAL NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "customer_type" "package_customer_type" NOT NULL,
  "description" TEXT,
  "price" DECIMAL(12,2) NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'XAF',
  "billing_period" "package_billing_period" NOT NULL DEFAULT 'ONE_TIME',
  "duration_days" INTEGER,
  "supports_recurring" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "packages_pkey" PRIMARY KEY ("id")
);

INSERT INTO "packages" ("name", "customer_type", "description", "price", "currency", "billing_period", "duration_days", "is_active")
SELECT 'Private Starter', 'PRIVATE', 'Publish and manage a private property listing.', 5000.00, 'XAF', 'ONE_TIME', 30, true
WHERE NOT EXISTS (SELECT 1 FROM "packages" WHERE "name" = 'Private Starter' AND "customer_type" = 'PRIVATE');

INSERT INTO "packages" ("name", "customer_type", "description", "price", "currency", "billing_period", "duration_days", "is_active")
SELECT 'Agency Starter', 'AGENCY', 'Activate an agency account and manage agency listings.', 25000.00, 'XAF', 'ONE_TIME', 30, true
WHERE NOT EXISTS (SELECT 1 FROM "packages" WHERE "name" = 'Agency Starter' AND "customer_type" = 'AGENCY');

CREATE TABLE IF NOT EXISTS "agency_applications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "agency_id" INTEGER NOT NULL,
  "applicant_id" VARCHAR(16) NOT NULL,
  "package_id" INTEGER NOT NULL,
  "status" "agency_application_status" NOT NULL DEFAULT 'DRAFT',
  "review_note" TEXT,
  "submitted_at" TIMESTAMPTZ(6),
  "reviewed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agency_applications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "package_features" (
  "id" SERIAL NOT NULL,
  "package_id" INTEGER NOT NULL,
  "key" VARCHAR(100) NOT NULL,
  "value_type" "package_feature_value_type" NOT NULL,
  "boolean_value" BOOLEAN,
  "integer_value" INTEGER,
  "decimal_value" DECIMAL(12,2),
  "text_value" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "package_features_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "payments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" VARCHAR(16) NOT NULL,
  "package_id" INTEGER NOT NULL,
  "agency_id" INTEGER,
  "application_id" UUID,
  "amount" DECIMAL(12,2) NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "method" "payment_method" NOT NULL,
  "status" "payment_status" NOT NULL DEFAULT 'PENDING',
  "provider" VARCHAR(50) NOT NULL DEFAULT 'flutterwave',
  "provider_reference" VARCHAR(255),
  "provider_transaction_id" VARCHAR(255),
  "idempotency_key" VARCHAR(255) NOT NULL,
  "checkout_url" TEXT,
  "failure_reason" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paid_at" TIMESTAMPTZ(6),
  "refunded_at" TIMESTAMPTZ(6),
  CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "user_entitlements" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" VARCHAR(16) NOT NULL,
  "package_id" INTEGER NOT NULL,
  "agency_id" INTEGER,
  "payment_id" UUID NOT NULL,
  "status" "entitlement_status" NOT NULL DEFAULT 'ACTIVE',
  "starts_at" TIMESTAMPTZ(6) NOT NULL,
  "expires_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_entitlements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "subscriptions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" VARCHAR(16) NOT NULL,
  "package_id" INTEGER NOT NULL,
  "provider" VARCHAR(50) NOT NULL,
  "provider_subscription_id" VARCHAR(255),
  "status" VARCHAR(40) NOT NULL,
  "current_period_start" TIMESTAMPTZ(6),
  "current_period_end" TIMESTAMPTZ(6),
  "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
  "cancelled_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "payment_webhook_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "provider" VARCHAR(50) NOT NULL,
  "provider_event_id" VARCHAR(255),
  "provider_transaction_id" VARCHAR(255),
  "payment_id" UUID,
  "event_type" VARCHAR(100) NOT NULL,
  "payload" JSONB NOT NULL,
  "processed" BOOLEAN NOT NULL DEFAULT false,
  "processing_error" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMPTZ(6),
  CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "audit_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" VARCHAR(16),
  "event_type" VARCHAR(100) NOT NULL,
  "entity_type" VARCHAR(60) NOT NULL,
  "entity_id" VARCHAR(255),
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "unique_package_feature" ON "package_features" ("package_id", "key");
CREATE INDEX IF NOT EXISTS "packages_customer_type_is_active_idx" ON "packages" ("customer_type", "is_active");
CREATE INDEX IF NOT EXISTS "package_features_key_idx" ON "package_features" ("key");
CREATE INDEX IF NOT EXISTS "agency_applications_agency_id_status_idx" ON "agency_applications" ("agency_id", "status");
CREATE INDEX IF NOT EXISTS "agency_applications_applicant_id_status_idx" ON "agency_applications" ("applicant_id", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "payments_provider_reference_key" ON "payments" ("provider_reference");
CREATE UNIQUE INDEX IF NOT EXISTS "payments_provider_transaction_id_key" ON "payments" ("provider_transaction_id");
CREATE UNIQUE INDEX IF NOT EXISTS "payments_idempotency_key_key" ON "payments" ("idempotency_key");
CREATE INDEX IF NOT EXISTS "payments_user_id_status_idx" ON "payments" ("user_id", "status");
CREATE INDEX IF NOT EXISTS "payments_agency_id_status_idx" ON "payments" ("agency_id", "status");
CREATE INDEX IF NOT EXISTS "payments_provider_status_idx" ON "payments" ("provider", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "user_entitlements_payment_id_key" ON "user_entitlements" ("payment_id");
CREATE INDEX IF NOT EXISTS "user_entitlements_user_id_status_expires_at_idx" ON "user_entitlements" ("user_id", "status", "expires_at");
CREATE INDEX IF NOT EXISTS "user_entitlements_agency_id_status_expires_at_idx" ON "user_entitlements" ("agency_id", "status", "expires_at");
CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_provider_subscription_id_key" ON "subscriptions" ("provider_subscription_id");
CREATE INDEX IF NOT EXISTS "subscriptions_user_id_status_idx" ON "subscriptions" ("user_id", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "payment_webhook_events_provider_event_id_key" ON "payment_webhook_events" ("provider_event_id");
CREATE INDEX IF NOT EXISTS "payment_webhook_events_provider_provider_transaction_id_idx" ON "payment_webhook_events" ("provider", "provider_transaction_id");
CREATE INDEX IF NOT EXISTS "payment_webhook_events_processed_created_at_idx" ON "payment_webhook_events" ("processed", "created_at");
CREATE INDEX IF NOT EXISTS "audit_events_event_type_created_at_idx" ON "audit_events" ("event_type", "created_at");
CREATE INDEX IF NOT EXISTS "audit_events_entity_type_entity_id_idx" ON "audit_events" ("entity_type", "entity_id");

DO $$
BEGIN
  ALTER TABLE "agency_applications" ADD CONSTRAINT "agency_applications_agency_id_fkey"
    FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  ALTER TABLE "agency_applications" ADD CONSTRAINT "agency_applications_applicant_id_fkey"
    FOREIGN KEY ("applicant_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  ALTER TABLE "agency_applications" ADD CONSTRAINT "agency_applications_package_id_fkey"
    FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "package_features" ADD CONSTRAINT "package_features_package_id_fkey"
    FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  ALTER TABLE "payments" ADD CONSTRAINT "payments_package_id_fkey"
    FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  ALTER TABLE "payments" ADD CONSTRAINT "payments_agency_id_fkey"
    FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  ALTER TABLE "payments" ADD CONSTRAINT "payments_application_id_fkey"
    FOREIGN KEY ("application_id") REFERENCES "agency_applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "user_entitlements" ADD CONSTRAINT "user_entitlements_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  ALTER TABLE "user_entitlements" ADD CONSTRAINT "user_entitlements_package_id_fkey"
    FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  ALTER TABLE "user_entitlements" ADD CONSTRAINT "user_entitlements_agency_id_fkey"
    FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  ALTER TABLE "user_entitlements" ADD CONSTRAINT "user_entitlements_payment_id_fkey"
    FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_package_id_fkey"
    FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "payment_webhook_events_payment_id_fkey"
    FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
