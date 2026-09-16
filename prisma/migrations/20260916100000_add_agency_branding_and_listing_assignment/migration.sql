ALTER TABLE "users"
ADD COLUMN "avatar_url" TEXT;

ALTER TABLE "agencies"
ADD COLUMN "logo_url" TEXT;

ALTER TABLE "listings"
ADD COLUMN "assigned_agent_id" VARCHAR(16);

ALTER TABLE "listings"
ADD CONSTRAINT "listings_assigned_agent_id_fkey"
FOREIGN KEY ("assigned_agent_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "listings_assigned_agent_id_idx"
ON "listings"("assigned_agent_id");