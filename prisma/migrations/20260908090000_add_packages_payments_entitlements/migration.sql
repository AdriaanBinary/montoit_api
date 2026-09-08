-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('PRIVATE', 'AGENT', 'AGENCY_OWNER', 'ADMIN');

-- CreateEnum
CREATE TYPE "agency_status" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'ACTIVE', 'REJECTED');

-- CreateEnum
CREATE TYPE "agency_document_type" AS ENUM ('BUSINESS_REGISTRATION', 'OWNER_ID');

-- CreateEnum
CREATE TYPE "agency_invitation_status" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'REVOKED');

-- CreateEnum
CREATE TYPE "listing_owner_type" AS ENUM ('PRIVATE', 'AGENT');

-- CreateEnum
CREATE TYPE "listing_type" AS ENUM ('SALE', 'RENT');

-- CreateEnum
CREATE TYPE "PropertyType" AS ENUM ('House', 'Apartment / Flat', 'Villa', 'Commercial', 'Industrial', 'Vacant Land');

-- CreateEnum
CREATE TYPE "ListingOptionType" AS ENUM ('AMENITY', 'SECURITY_OPTION');

-- CreateEnum
CREATE TYPE "listing_status" AS ENUM ('draft', 'active', 'archived', 'sold');

-- CreateEnum
CREATE TYPE "package_customer_type" AS ENUM ('PRIVATE', 'AGENCY');

-- CreateEnum
CREATE TYPE "package_billing_period" AS ENUM ('ONE_TIME', 'MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "package_feature_value_type" AS ENUM ('BOOLEAN', 'INTEGER', 'DECIMAL', 'TEXT');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "payment_method" AS ENUM ('CARD', 'MOBILE_MONEY', 'OTHER');

-- CreateEnum
CREATE TYPE "entitlement_status" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "agency_application_status" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "agency_account_status" AS ENUM ('PENDING_PAYMENT', 'ACTIVE', 'SUSPENDED', 'EXPIRED');

-- CreateTable
CREATE TABLE "users" (
    "id" VARCHAR(16) NOT NULL,
    "username" VARCHAR(100) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(50),
    "password" TEXT,
    "role" "user_role" NOT NULL DEFAULT 'PRIVATE',
    "subscription" VARCHAR(50) DEFAULT 'free',
    "subscription_expiry" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listings" (
    "id" SERIAL NOT NULL,
    "user_id" VARCHAR(16) NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "location" TEXT,
    "property_type" "PropertyType",
    "listing_type" "listing_type" NOT NULL DEFAULT 'SALE',
    "bedrooms" INTEGER,
    "bathrooms" DECIMAL(3,1),
    "property_size" DECIMAL(8,2),
    "living_area" DECIMAL(8,2),
    "land_size" DECIMAL(8,2),
    "amount" DECIMAL(12,2),
    "furnished" BOOLEAN,
    "available_from" TIMESTAMPTZ(6),
    "rental_term" VARCHAR(50),
    "parking_spaces" INTEGER,
    "parking_type" VARCHAR(50),
    "pet_friendly" BOOLEAN DEFAULT false,
    "garden" BOOLEAN DEFAULT false,
    "pool" BOOLEAN DEFAULT false,
    "flatlet" BOOLEAN DEFAULT false,
    "retirement" BOOLEAN DEFAULT false,
    "on_show" BOOLEAN DEFAULT false,
    "security_estate" BOOLEAN DEFAULT false,
    "currency" CHAR(3) NOT NULL DEFAULT 'XAF',
    "features" TEXT[],
    "other" TEXT[],
    "status" "listing_status" NOT NULL DEFAULT 'draft',
    "sold" BOOLEAN DEFAULT false,
    "region_id" INTEGER,
    "city_id" INTEGER,
    "municipality_id" INTEGER,
    "neighborhood_id" INTEGER,
    "listing_owner_type" "listing_owner_type" DEFAULT 'PRIVATE',
    "agency_id" INTEGER,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "rights_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "rights_confirmed_at" TIMESTAMPTZ(6),
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_options" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "type" "ListingOptionType" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_option_selections" (
    "id" SERIAL NOT NULL,
    "listing_id" INTEGER NOT NULL,
    "option_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_option_selections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "general_fees" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "general_fees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_general_fee_selections" (
    "id" SERIAL NOT NULL,
    "listing_id" INTEGER NOT NULL,
    "fee_id" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_general_fee_selections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_other_general_fees" (
    "id" SERIAL NOT NULL,
    "listing_id" INTEGER NOT NULL,
    "description" VARCHAR(255) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_other_general_fees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_images" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "listing_id" INTEGER NOT NULL,
    "object_key" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "width" INTEGER,
    "height" INTEGER,
    "upload_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_enquiries" (
    "id" SERIAL NOT NULL,
    "listing_id" INTEGER NOT NULL,
    "listing_owner_user_id" VARCHAR(16) NOT NULL,
    "submitted_by_user_id" VARCHAR(16),
    "name" VARCHAR(160) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(50),
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_enquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_favorites" (
    "id" SERIAL NOT NULL,
    "user_id" VARCHAR(16) NOT NULL,
    "listing_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_favorites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agencies" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "slug" VARCHAR(140) NOT NULL,
    "description" TEXT,
    "email" VARCHAR(255),
    "phone" VARCHAR(50),
    "website" TEXT,
    "address_line1" TEXT,
    "address_line2" TEXT,
    "region_id" INTEGER,
    "city_id" INTEGER,
    "municipality_id" INTEGER,
    "neighborhood_id" INTEGER,
    "created_by_user_id" VARCHAR(16) NOT NULL,
    "status" "agency_status" NOT NULL DEFAULT 'DRAFT',
    "submitted_at" TIMESTAMPTZ(6),
    "reviewed_at" TIMESTAMPTZ(6),
    "reviewed_by_user_id" VARCHAR(16),
    "review_note" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "application_status" "agency_application_status" NOT NULL DEFAULT 'DRAFT',
    "account_status" "agency_account_status" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agency_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agency_id" INTEGER NOT NULL,
    "document_type" "agency_document_type" NOT NULL,
    "object_key" TEXT NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "content_type" VARCHAR(100) NOT NULL,
    "upload_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agency_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agency_agents" (
    "id" BIGSERIAL NOT NULL,
    "agency_id" INTEGER NOT NULL,
    "user_id" VARCHAR(16) NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "listing_limit" INTEGER,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agency_agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agency_invitations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agency_id" INTEGER NOT NULL,
    "invited_user_id" VARCHAR(16) NOT NULL,
    "invited_by_user_id" VARCHAR(16) NOT NULL,
    "status" "agency_invitation_status" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMPTZ(6),
    "accepted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agency_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regions" (
    "id" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "geometry" JSONB,

    CONSTRAINT "regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cities" (
    "id" INTEGER NOT NULL,
    "region_id" INTEGER NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "geometry" JSONB,

    CONSTRAINT "cities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "municipalities" (
    "id" INTEGER NOT NULL,
    "city_id" INTEGER NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "geometry" JSONB,

    CONSTRAINT "municipalities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "neighborhoods" (
    "id" SERIAL NOT NULL,
    "municipality_id" INTEGER NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "aliases" TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "neighborhoods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packages" (
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

-- CreateTable
CREATE TABLE "package_features" (
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

-- CreateTable
CREATE TABLE "payments" (
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

-- CreateTable
CREATE TABLE "user_entitlements" (
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

-- CreateTable
CREATE TABLE "agency_applications" (
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

-- CreateTable
CREATE TABLE "subscriptions" (
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

-- CreateTable
CREATE TABLE "payment_webhook_events" (
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

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" VARCHAR(16),
    "event_type" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(60) NOT NULL,
    "entity_id" VARCHAR(255),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "listing_options_name_key" ON "listing_options"("name");

-- CreateIndex
CREATE INDEX "listing_option_selections_option_id_idx" ON "listing_option_selections"("option_id");

-- CreateIndex
CREATE UNIQUE INDEX "unique_listing_option_selection" ON "listing_option_selections"("listing_id", "option_id");

-- CreateIndex
CREATE UNIQUE INDEX "general_fees_name_key" ON "general_fees"("name");

-- CreateIndex
CREATE INDEX "listing_general_fee_selections_fee_id_idx" ON "listing_general_fee_selections"("fee_id");

-- CreateIndex
CREATE UNIQUE INDEX "unique_listing_general_fee_selection" ON "listing_general_fee_selections"("listing_id", "fee_id");

-- CreateIndex
CREATE INDEX "listing_other_general_fees_listing_id_idx" ON "listing_other_general_fees"("listing_id");

-- CreateIndex
CREATE UNIQUE INDEX "unique_user_favorite_listing" ON "user_favorites"("user_id", "listing_id");

-- CreateIndex
CREATE UNIQUE INDEX "agencies_slug_key" ON "agencies"("slug");

-- CreateIndex
CREATE INDEX "agencies_created_by_user_id_idx" ON "agencies"("created_by_user_id");

-- CreateIndex
CREATE INDEX "agencies_status_idx" ON "agencies"("status");

-- CreateIndex
CREATE INDEX "agency_documents_agency_id_idx" ON "agency_documents"("agency_id");

-- CreateIndex
CREATE UNIQUE INDEX "unique_agency_document_type" ON "agency_documents"("agency_id", "document_type");

-- CreateIndex
CREATE UNIQUE INDEX "agency_agents_user_id_key" ON "agency_agents"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "unique_agency_user" ON "agency_agents"("agency_id", "user_id");

-- CreateIndex
CREATE INDEX "agency_invitations_invited_user_id_status_idx" ON "agency_invitations"("invited_user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "unique_agency_invited_user" ON "agency_invitations"("agency_id", "invited_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "regions_name_key" ON "regions"("name");

-- CreateIndex
CREATE UNIQUE INDEX "unique_city_per_region" ON "cities"("region_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "unique_municipality_per_city" ON "municipalities"("city_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "unique_neighborhood_per_municipality" ON "neighborhoods"("municipality_id", "name");

-- CreateIndex
CREATE INDEX "packages_customer_type_is_active_idx" ON "packages"("customer_type", "is_active");

-- CreateIndex
CREATE INDEX "package_features_key_idx" ON "package_features"("key");

-- CreateIndex
CREATE UNIQUE INDEX "unique_package_feature" ON "package_features"("package_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_reference_key" ON "payments"("provider_reference");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_transaction_id_key" ON "payments"("provider_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");

-- CreateIndex
CREATE INDEX "payments_user_id_status_idx" ON "payments"("user_id", "status");

-- CreateIndex
CREATE INDEX "payments_agency_id_status_idx" ON "payments"("agency_id", "status");

-- CreateIndex
CREATE INDEX "payments_provider_status_idx" ON "payments"("provider", "status");

-- CreateIndex
CREATE UNIQUE INDEX "user_entitlements_payment_id_key" ON "user_entitlements"("payment_id");

-- CreateIndex
CREATE INDEX "user_entitlements_user_id_status_expires_at_idx" ON "user_entitlements"("user_id", "status", "expires_at");

-- CreateIndex
CREATE INDEX "user_entitlements_agency_id_status_expires_at_idx" ON "user_entitlements"("agency_id", "status", "expires_at");

-- CreateIndex
CREATE INDEX "agency_applications_agency_id_status_idx" ON "agency_applications"("agency_id", "status");

-- CreateIndex
CREATE INDEX "agency_applications_applicant_id_status_idx" ON "agency_applications"("applicant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_provider_subscription_id_key" ON "subscriptions"("provider_subscription_id");

-- CreateIndex
CREATE INDEX "subscriptions_user_id_status_idx" ON "subscriptions"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_webhook_events_provider_event_id_key" ON "payment_webhook_events"("provider_event_id");

-- CreateIndex
CREATE INDEX "payment_webhook_events_provider_provider_transaction_id_idx" ON "payment_webhook_events"("provider", "provider_transaction_id");

-- CreateIndex
CREATE INDEX "payment_webhook_events_processed_created_at_idx" ON "payment_webhook_events"("processed", "created_at");

-- CreateIndex
CREATE INDEX "audit_events_event_type_created_at_idx" ON "audit_events"("event_type", "created_at");

-- CreateIndex
CREATE INDEX "audit_events_entity_type_entity_id_idx" ON "audit_events"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_option_selections" ADD CONSTRAINT "listing_option_selections_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_option_selections" ADD CONSTRAINT "listing_option_selections_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "listing_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_general_fee_selections" ADD CONSTRAINT "listing_general_fee_selections_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_general_fee_selections" ADD CONSTRAINT "listing_general_fee_selections_fee_id_fkey" FOREIGN KEY ("fee_id") REFERENCES "general_fees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_other_general_fees" ADD CONSTRAINT "listing_other_general_fees_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_enquiries" ADD CONSTRAINT "listing_enquiries_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_enquiries" ADD CONSTRAINT "listing_enquiries_listing_owner_user_id_fkey" FOREIGN KEY ("listing_owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_enquiries" ADD CONSTRAINT "listing_enquiries_submitted_by_user_id_fkey" FOREIGN KEY ("submitted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_favorites" ADD CONSTRAINT "user_favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_favorites" ADD CONSTRAINT "user_favorites_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agencies" ADD CONSTRAINT "agencies_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agencies" ADD CONSTRAINT "agencies_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agency_documents" ADD CONSTRAINT "agency_documents_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agency_agents" ADD CONSTRAINT "agency_agents_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agency_agents" ADD CONSTRAINT "agency_agents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agency_invitations" ADD CONSTRAINT "agency_invitations_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agency_invitations" ADD CONSTRAINT "agency_invitations_invited_user_id_fkey" FOREIGN KEY ("invited_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agency_invitations" ADD CONSTRAINT "agency_invitations_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_features" ADD CONSTRAINT "package_features_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "agency_applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_entitlements" ADD CONSTRAINT "user_entitlements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_entitlements" ADD CONSTRAINT "user_entitlements_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_entitlements" ADD CONSTRAINT "user_entitlements_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_entitlements" ADD CONSTRAINT "user_entitlements_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agency_applications" ADD CONSTRAINT "agency_applications_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agency_applications" ADD CONSTRAINT "agency_applications_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agency_applications" ADD CONSTRAINT "agency_applications_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "payment_webhook_events_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
