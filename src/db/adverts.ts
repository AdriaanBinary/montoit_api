import prisma from './prisma.js';

export async function ensureAdvertCampaignsSchema(): Promise<void> {
  await prisma.$executeRaw`
    DO $$
    BEGIN
      CREATE TYPE "advert_placement" AS ENUM ('HORIZONTAL', 'VERTICAL');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `;

  await prisma.$executeRaw`
    ALTER TABLE IF EXISTS "advert_campaigns"
      ADD COLUMN IF NOT EXISTS "placement" "advert_placement" NOT NULL DEFAULT 'HORIZONTAL';
  `;

  await prisma.$executeRaw`
    ALTER TABLE IF EXISTS "advert_payments"
      ADD COLUMN IF NOT EXISTS "extension_months" INTEGER;
  `;

  await prisma.$executeRaw`
    ALTER TABLE IF EXISTS "advert_campaigns"
      ADD COLUMN IF NOT EXISTS "editable_until" TIMESTAMPTZ(6);
  `;

  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS "advert_campaigns_placement_lookup_idx"
      ON "advert_campaigns" ("placement", "status", "starts_at", "expires_at", "visibility_score", "created_at");
  `;
}
