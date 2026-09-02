CREATE TYPE "agency_invitation_status" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'REVOKED');

ALTER TABLE "agency_agents"
  ADD COLUMN IF NOT EXISTS "listing_limit" INTEGER;

ALTER TABLE "agency_agents"
  ADD CONSTRAINT "agency_agents_listing_limit_check"
  CHECK ("listing_limit" IS NULL OR "listing_limit" >= 0);

CREATE UNIQUE INDEX "agency_agents_user_id_key" ON "agency_agents"("user_id");

CREATE TABLE "agency_invitations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "agency_id" INTEGER NOT NULL,
  "invited_user_id" VARCHAR(16) NOT NULL,
  "invited_by_user_id" VARCHAR(16) NOT NULL,
  "status" "agency_invitation_status" NOT NULL DEFAULT 'PENDING',
  "expires_at" TIMESTAMPTZ(6),
  "accepted_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "agency_invitations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "unique_agency_invited_user" UNIQUE ("agency_id", "invited_user_id"),
  CONSTRAINT "agency_invitations_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "agency_invitations_invited_user_id_fkey" FOREIGN KEY ("invited_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "agency_invitations_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "agency_invitations_invited_user_id_status_idx" ON "agency_invitations"("invited_user_id", "status");

ALTER TABLE "agency_agents"
  ADD CONSTRAINT "agency_agents_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID,
  ADD CONSTRAINT "agency_agents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

ALTER TABLE "listings"
  ADD CONSTRAINT "listings_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;