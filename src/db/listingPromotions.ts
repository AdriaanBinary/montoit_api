import prisma from './prisma.js';

type PromotionRow = {
  id: string;
  listing_id: number;
  user_id: string;
  package_id: number;
  type: string;
  status: string;
  starts_at: Date;
  expires_at: Date;
  created_at: Date;
};

const listingPromotionsDb = {
  getActiveForListing: async function(listingId: number): Promise<PromotionRow | null> {
    const rows = await prisma.$queryRaw<PromotionRow[]>`
      SELECT id, listing_id, user_id, package_id, type, status, starts_at, expires_at, created_at
      FROM listing_promotions
      WHERE listing_id = ${listingId}
        AND type = 'FEATURED'::listing_promotion_type
        AND status = 'ACTIVE'::listing_promotion_status
        AND starts_at <= NOW()
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
    `;
    return rows[0] ?? null;
  },

  countUserPromotionsThisMonth: async function(userId: string): Promise<number> {
    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM listing_promotions
      WHERE user_id = ${userId}
        AND type = 'FEATURED'::listing_promotion_type
        AND status <> 'CANCELLED'::listing_promotion_status
        AND created_at >= date_trunc('month', NOW())
    `;
    return Number(rows[0]?.count ?? 0);
  },

  createFeatured: async function(userId: string, listingId: number, packageId: number, expiresAt: Date): Promise<PromotionRow> {
    const rows = await prisma.$queryRaw<PromotionRow[]>`
      INSERT INTO listing_promotions (listing_id, user_id, package_id, type, status, starts_at, expires_at)
      VALUES (${listingId}, ${userId}, ${packageId}, 'FEATURED'::listing_promotion_type, 'ACTIVE'::listing_promotion_status, NOW(), ${expiresAt})
      RETURNING id, listing_id, user_id, package_id, type, status, starts_at, expires_at, created_at
    `;
    return rows[0];
  },

  cancelActiveForListing: async function(listingId: number, userId: string): Promise<boolean> {
    const result = await prisma.$executeRaw`
      UPDATE listing_promotions
      SET status = 'CANCELLED'::listing_promotion_status, updated_at = NOW()
      WHERE listing_id = ${listingId}
        AND user_id = ${userId}
        AND type = 'FEATURED'::listing_promotion_type
        AND status = 'ACTIVE'::listing_promotion_status
    `;
    return result > 0;
  },

  getForListing: async function(listingId: number): Promise<PromotionRow[]> {
    return prisma.$queryRaw<PromotionRow[]>`
      SELECT id, listing_id, user_id, package_id, type, status, starts_at, expires_at, created_at
      FROM listing_promotions
      WHERE listing_id = ${listingId}
      ORDER BY created_at DESC
    `;
  }
};

export default listingPromotionsDb;