ALTER TABLE "users"
  ADD COLUMN "email_verified" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "email_verified_at" TIMESTAMPTZ(6),
  ADD COLUMN "verification_token" VARCHAR(128),
  ADD COLUMN "verification_expires_at" TIMESTAMPTZ(6),
  ADD COLUMN "verification_sent_at" TIMESTAMPTZ(6),
  ADD COLUMN "password_reset_token" VARCHAR(128),
  ADD COLUMN "password_reset_expires_at" TIMESTAMPTZ(6);
