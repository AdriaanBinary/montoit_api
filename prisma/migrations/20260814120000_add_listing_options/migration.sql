CREATE TYPE "ListingOptionType" AS ENUM ('AMENITY', 'SECURITY_OPTION');

CREATE TABLE "listing_options" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "type" "ListingOptionType" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_options_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "listing_option_selections" (
    "id" SERIAL NOT NULL,
    "listing_id" INTEGER NOT NULL,
    "option_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_option_selections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "listing_options_name_key" ON "listing_options"("name");
CREATE UNIQUE INDEX "unique_listing_option_selection" ON "listing_option_selections"("listing_id", "option_id");
CREATE INDEX "listing_option_selections_option_id_idx" ON "listing_option_selections"("option_id");

ALTER TABLE "listing_option_selections"
  ADD CONSTRAINT "listing_option_selections_listing_id_fkey"
  FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "listing_option_selections"
  ADD CONSTRAINT "listing_option_selections_option_id_fkey"
  FOREIGN KEY ("option_id") REFERENCES "listing_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;
