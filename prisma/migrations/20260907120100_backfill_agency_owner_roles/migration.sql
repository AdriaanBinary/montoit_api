UPDATE "users" AS u
SET "role" = 'AGENCY_OWNER', "updated_at" = NOW()
WHERE EXISTS (
  SELECT 1
  FROM "agencies" AS a
  WHERE a."created_by_user_id" = u."id"
);