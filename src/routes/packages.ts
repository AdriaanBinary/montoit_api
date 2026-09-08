import express from 'express';
import { z } from 'zod';
import { registerApiRoute } from '../docs/swagger.js';
import prisma from '../db/prisma.js';

const router = express.Router();

const fallbackPackages = [
  {
    id: 1,
    name: 'Private Starter',
    customer_type: 'PRIVATE',
    description: 'Publish and manage a private property listing.',
    price: '5000.00',
    currency: 'XAF',
    billing_period: 'ONE_TIME',
    duration_days: 30,
    supports_recurring: false
  },
  {
    id: 2,
    name: 'Agency Starter',
    customer_type: 'AGENCY',
    description: 'Activate an agency account and manage agency listings.',
    price: '25000.00',
    currency: 'XAF',
    billing_period: 'ONE_TIME',
    duration_days: 30,
    supports_recurring: false
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
    }>>`
      SELECT id, name, customer_type, description, price::text, currency,
             billing_period, duration_days, supports_recurring
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