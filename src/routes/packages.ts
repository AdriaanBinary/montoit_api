import express from 'express';
import { z } from 'zod';
import { registerApiRoute } from '../docs/swagger.js';
import prisma from '../db/prisma.js';

const router = express.Router();

const fallbackPackages = [
  {
    id: 3,
    name: 'Private Seller',
    customer_type: 'PRIVATE',
    description: 'Publish and manage one private property listing.',
    price: '5000.00',
    currency: 'XAF',
    billing_period: 'ONE_TIME',
    duration_days: 30,
    supports_recurring: false,
    features: { active_listings: 1, agents: 0, photos_per_listing: 10, featured_listings_per_month: 0, agent_profile: true, verification_badge: false, priority_placement: false }
  },
  {
    id: 4,
    name: 'Starter Pack',
    customer_type: 'PRIVATE',
    description: 'Publish one private property listing for three months.',
    price: '25000.00',
    currency: 'XAF',
    billing_period: 'ONE_TIME',
    duration_days: 90,
    supports_recurring: false,
    features: { active_listings: 1, agents: 0, photos_per_listing: 20, featured_listings_per_month: 1, agent_profile: true, verification_badge: false, priority_placement: true }
  },
  {
    id: 5,
    name: 'Agent Pro',
    customer_type: 'AGENCY',
    description: 'Run an agency with up to 20 listings and 6 agents.',
    price: '50000.00',
    currency: 'XAF',
    billing_period: 'ONE_TIME',
    duration_days: 180,
    supports_recurring: false,
    features: { active_listings: 20, agents: 6, photos_per_listing: 30, featured_listings_per_month: 8, agent_profile: true, verification_badge: true, priority_placement: true }
  },
  {
    id: 6,
    name: 'Agent Premium',
    customer_type: 'AGENCY',
    description: 'Run an agency with up to 50 listings and 20 agents.',
    price: '75000.00',
    currency: 'XAF',
    billing_period: 'ONE_TIME',
    duration_days: 180,
    supports_recurring: false,
    features: { active_listings: 50, agents: 20, photos_per_listing: 45, featured_listings_per_month: 12, agent_profile: true, verification_badge: true, priority_placement: true }
  }
];

const packageResponseSchema = z.object({
  success: z.boolean(),
  packages: z.array(z.record(z.string(), z.unknown()))
});

registerApiRoute({
  method: 'get',
  path: '/api/packages',
  summary: 'List active payment packages',
  tags: ['Packages'],
  responses: {
    200: { description: 'Active packages', schema: packageResponseSchema },
    500: { description: 'Failed to load packages', schema: packageResponseSchema }
  }
});

router.get('/packages', async (_req, res) => {
  try {
    const packages = await prisma.$queryRaw<Array<{
      id: number;
      name: string;
      customer_type: string;
      description: string | null;
      price: string;
      currency: string;
      billing_period: string;
      duration_days: number | null;
      supports_recurring: boolean;
      features: Record<string, boolean | number | null>;
    }>>`
      SELECT id, name, customer_type, description, price::text, currency,
             billing_period, duration_days, supports_recurring,
             COALESCE((
               SELECT jsonb_object_agg(feature.key, feature.value)
               FROM (
                 SELECT pf.key,
                        CASE
                          WHEN pf.value_type = 'BOOLEAN' THEN to_jsonb(pf.boolean_value)
                          WHEN pf.value_type = 'INTEGER' THEN to_jsonb(pf.integer_value)
                          WHEN pf.value_type = 'DECIMAL' THEN to_jsonb(pf.decimal_value)
                          ELSE to_jsonb(pf.text_value)
                        END AS value
                 FROM package_features pf
                 WHERE pf.package_id = packages.id
               ) feature
             ), '{}'::jsonb) AS features
      FROM packages
      WHERE is_active = true
      ORDER BY customer_type, price
    `;

    return res.json({ success: true, packages });
  } catch (error) {
    console.error('Failed to load packages:', error);
    return res.json({
      success: true,
      packages: fallbackPackages,
      warning: 'Using fallback package catalog. Run the latest database migrations.'
    });
  }
});

export default router;