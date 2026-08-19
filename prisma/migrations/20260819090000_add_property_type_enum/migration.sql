CREATE TYPE "PropertyType" AS ENUM (
  'House',
  'Apartment / Flat',
  'Villa',
  'Commercial',
  'Industrial',
  'Vacant Land'
);

ALTER TABLE "listings"
  ALTER COLUMN "property_type" TYPE "PropertyType"
  USING CASE lower(trim("property_type"))
    WHEN 'house' THEN 'House'::"PropertyType"
    WHEN 'apartment / flat' THEN 'Apartment / Flat'::"PropertyType"
    WHEN 'apartment' THEN 'Apartment / Flat'::"PropertyType"
    WHEN 'flat' THEN 'Apartment / Flat'::"PropertyType"
    WHEN 'villa' THEN 'Villa'::"PropertyType"
    WHEN 'commercial' THEN 'Commercial'::"PropertyType"
    WHEN 'industrial' THEN 'Industrial'::"PropertyType"
    WHEN 'vacant land' THEN 'Vacant Land'::"PropertyType"
    WHEN 'land' THEN 'Vacant Land'::"PropertyType"
    ELSE NULL
  END;