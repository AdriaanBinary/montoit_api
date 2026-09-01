ALTER TYPE "user_role" ADD VALUE IF NOT EXISTS 'ADMIN';

CREATE TYPE "agency_status" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'ACTIVE', 'REJECTED');
CREATE TYPE "agency_document_type" AS ENUM ('BUSINESS_REGISTRATION', 'OWNER_ID');

ALTER TABLE "agencies"
  ADD COLUMN IF NOT EXISTS "status" "agency_status" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS "submitted_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "reviewed_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "reviewed_by_user_id" VARCHAR(16),
  ADD COLUMN IF NOT EXISTS "review_note" TEXT;

UPDATE "agencies"
SET "status" = CASE WHEN "is_active" THEN 'ACTIVE'::"agency_status" ELSE 'DRAFT'::"agency_status" END;

ALTER TABLE "agencies"
  ALTER COLUMN "is_active" SET DEFAULT false,
  ADD CONSTRAINT "agencies_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "agencies_reviewed_by_user_id_fkey"
    FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "agencies_created_by_user_id_idx" ON "agencies"("created_by_user_id");
CREATE INDEX "agencies_status_idx" ON "agencies"("status");

CREATE TABLE "agency_documents" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "agency_id" INTEGER NOT NULL,
  "document_type" "agency_document_type" NOT NULL,
  "object_key" TEXT NOT NULL,
  "file_name" VARCHAR(255) NOT NULL,
  "content_type" VARCHAR(100) NOT NULL,
  "upload_confirmed" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "agency_documents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "agency_documents_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "unique_agency_document_type" UNIQUE ("agency_id", "document_type")
);

CREATE INDEX "agency_documents_agency_id_idx" ON "agency_documents"("agency_id");