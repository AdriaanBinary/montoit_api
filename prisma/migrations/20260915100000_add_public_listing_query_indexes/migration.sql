CREATE INDEX IF NOT EXISTS "listings_public_filter_idx"
  ON "listings" ("status", "is_published", "deleted_at", "created_at");

CREATE INDEX IF NOT EXISTS "listing_images_public_lookup_idx"
  ON "listing_images" ("listing_id", "upload_confirmed", "sort_order", "created_at");

CREATE INDEX IF NOT EXISTS "listing_impressions_ranking_idx"
  ON "listing_impressions" ("listing_id", "was_featured", "created_at");