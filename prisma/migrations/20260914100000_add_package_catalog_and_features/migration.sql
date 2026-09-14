-- Replace the initial starter catalog without deleting rows that may already be
-- referenced by payments or entitlements.
UPDATE "packages"
SET "is_active" = false,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "name" IN ('Private Starter', 'Agency Starter');

INSERT INTO "packages" (
  "name", "customer_type", "description", "price", "currency",
  "billing_period", "duration_days", "supports_recurring", "is_active"
)
SELECT "name", "customer_type"::"package_customer_type", "description",
       "price", 'XAF', 'ONE_TIME'::"package_billing_period", "duration_days",
       false, true
FROM (VALUES
  ('Private Seller', 'PRIVATE', 'Publish and manage one private property listing.', 5000.00::numeric, 30),
  ('Starter Pack', 'PRIVATE', 'Publish one private property listing for three months.', 25000.00::numeric, 90),
  ('Agent Pro', 'AGENCY', 'Run an agency with up to 20 listings and 6 agents.', 50000.00::numeric, 180),
  ('Agent Premium', 'AGENCY', 'Run an agency with up to 50 listings and 20 agents.', 75000.00::numeric, 180)
) AS catalog("name", "customer_type", "description", "price", "duration_days")
WHERE NOT EXISTS (
  SELECT 1
  FROM "packages" existing
  WHERE existing."name" = catalog."name"
    AND existing."customer_type" = catalog."customer_type"::"package_customer_type"
);

WITH package_values("name", "customer_type", "active_listings", "agents", "photos", "featured", "profile", "badge", "priority") AS (
  VALUES
    ('Private Seller', 'PRIVATE', 1, 0, 10, 0, true, false, false),
    ('Starter Pack', 'PRIVATE', 1, 0, 20, 1, true, false, true),
    ('Agent Pro', 'AGENCY', 20, 6, 30, 8, true, true, true),
    ('Agent Premium', 'AGENCY', 50, 20, 45, 12, true, true, true)
),
selected_packages AS (
  SELECT p.id, v.active_listings, v.agents, v.photos, v.featured,
         v.profile, v.badge, v.priority
  FROM package_values v
  JOIN "packages" p
    ON p."name" = v."name"
   AND p."customer_type" = v."customer_type"::"package_customer_type"
)
INSERT INTO "package_features" ("package_id", "key", "value_type", "boolean_value", "integer_value")
SELECT selected_packages.id, feature."key", feature."value_type"::"package_feature_value_type",
       feature."boolean_value", feature."integer_value"
FROM selected_packages
CROSS JOIN LATERAL (
  VALUES
    ('active_listings', 'INTEGER', NULL::boolean, selected_packages.active_listings),
    ('agents', 'INTEGER', NULL::boolean, selected_packages.agents),
    ('photos_per_listing', 'INTEGER', NULL::boolean, selected_packages.photos),
    ('featured_listings_per_month', 'INTEGER', NULL::boolean, selected_packages.featured),
    ('agent_profile', 'BOOLEAN', selected_packages.profile, NULL::integer),
    ('verification_badge', 'BOOLEAN', selected_packages.badge, NULL::integer),
    ('priority_placement', 'BOOLEAN', selected_packages.priority, NULL::integer)
) AS feature("key", "value_type", "boolean_value", "integer_value")
ON CONFLICT ("package_id", "key") DO UPDATE
SET "value_type" = EXCLUDED."value_type",
    "boolean_value" = EXCLUDED."boolean_value",
    "integer_value" = EXCLUDED."integer_value",
    "updated_at" = CURRENT_TIMESTAMP;