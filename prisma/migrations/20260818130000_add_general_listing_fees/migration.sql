CREATE TABLE "general_fees" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "general_fees_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "listing_general_fee_selections" (
    "id" SERIAL NOT NULL,
    "listing_id" INTEGER NOT NULL,
    "fee_id" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_general_fee_selections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "listing_other_general_fees" (
    "id" SERIAL NOT NULL,
    "listing_id" INTEGER NOT NULL,
    "description" VARCHAR(255) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_other_general_fees_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "general_fees_name_key" ON "general_fees"("name");
CREATE UNIQUE INDEX "unique_listing_general_fee_selection" ON "listing_general_fee_selections"("listing_id", "fee_id");
CREATE INDEX "listing_general_fee_selections_fee_id_idx" ON "listing_general_fee_selections"("fee_id");
CREATE INDEX "listing_other_general_fees_listing_id_idx" ON "listing_other_general_fees"("listing_id");

ALTER TABLE "listing_general_fee_selections"
  ADD CONSTRAINT "listing_general_fee_selections_listing_id_fkey"
  FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "listing_general_fee_selections"
  ADD CONSTRAINT "listing_general_fee_selections_fee_id_fkey"
  FOREIGN KEY ("fee_id") REFERENCES "general_fees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "listing_other_general_fees"
  ADD CONSTRAINT "listing_other_general_fees_listing_id_fkey"
  FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "general_fees" ("name") VALUES
  ('Water'),
  ('Electricity'),
  ('Waste collection'),
  ('Security'),
  ('Maintenance'),
  ('Homeowners association'),
  ('Property tax');