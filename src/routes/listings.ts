import express, { Request, Response } from 'express';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import MontoitDB from '../db/pool.js';

interface AuthenticatedRequest extends Request {
  user?: {
    user_id?: string;
    email?: string;
    [key: string]: unknown;
  };
}

interface ListingCreateInput {
  title?: string;
  description?: string;
  property_type?: string;
  bedrooms?: number;
  bathrooms?: number;
  property_size?: number;
  amount?: number;
  currency?: string;
  features?: string[];
  other?: string[];
  status?: 'draft' | 'active' | 'archived' | 'sold';
  sold?: boolean;
  region_id?: number;
  city_id?: number;
  municipality_id?: number;
  neighborhood_id?: number;
  is_published?: boolean;
  verified?: boolean;
}

interface ListingImageInput {
  fileName?: string;
  name?: string;
  contentType?: string;
}

interface ListingImageUploadRequestBody {
  bucket?: string;
  images?: ListingImageInput[];
  name?: string;
}

const router = express.Router();

const s3Client = new S3Client({
  region: process.env.AWS_REGION ?? 'us-east-1',
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    : undefined
});

async function buildPresignedGetUrl(bucket: string, key: string): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key
  });

  return getSignedUrl(s3Client, command, { expiresIn: 3600 });
}

async function buildPresignedPutUrl(bucket: string, key: string, contentType: string): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType
  });

  return getSignedUrl(s3Client, command, { expiresIn: 3600 });
}

function normalizeListingStatus(status?: string): 'draft' | 'active' | 'archived' | 'sold' {
  if (status === 'active' || status === 'archived' || status === 'sold') {
    return status;
  }
  return 'draft';
}

export function normalizeCreateListingInput(input: Partial<ListingCreateInput>, userId: string) {
  const normalizedStatus = normalizeListingStatus(input.status);
  const features = Array.isArray(input.features) ? input.features : [];
  const other = Array.isArray(input.other) ? input.other : [];

  return {
    user_id: userId,
    title: input.title ?? null,
    description: input.description ?? null,
    property_type: input.property_type ?? null,
    bedrooms: input.bedrooms ?? null,
    bathrooms: input.bathrooms ?? null,
    property_size: input.property_size ?? null,
    amount: input.amount ?? null,
    currency: input.currency ?? 'USD',
    features,
    other,
    status: normalizedStatus,
    sold: Boolean(input.sold ?? false),
    region_id: input.region_id ?? null,
    city_id: input.city_id ?? null,
    municipality_id: input.municipality_id ?? null,
    neighborhood_id: input.neighborhood_id ?? null,
    is_published: Boolean(input.is_published ?? false),
    verified: Boolean(input.verified ?? false)
  };
}

router.post('/listings', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.user_id;

  if (!userId) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  try {
    const payload = normalizeCreateListingInput(req.body as Partial<ListingCreateInput>, userId);

    const columnNames = [
      'user_id',
      'title',
      'description',
      'property_type',
      'bedrooms',
      'bathrooms',
      'property_size',
      'amount',
      'currency',
      'features',
      'other',
      'status',
      'sold',
      'region_id',
      'city_id',
      'municipality_id',
      'neighborhood_id',
      'is_published',
      'verified'
    ];

    const placeholders = columnNames.map((_column, index) => `$${index + 1}`).join(', ');
    const values = columnNames.map((column) => (payload as Record<string, unknown>)[column]);

    const result = await MontoitDB.query(
      `INSERT INTO listings (${columnNames.join(', ')}) VALUES (${placeholders}) RETURNING *`,
      values
    );

    return res.status(201).json({ success: true, listing: result.rows[0] });
  } catch (error: unknown) {
    console.error('Create listing error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create listing',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

router.post('/listings/:id/publish', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.user_id;
  const listingId = Number(req.params.id);

  if (!userId) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  if (!Number.isInteger(listingId)) {
    return res.status(400).json({ success: false, error: 'Invalid listing id' });
  }

  try {
    const result = await MontoitDB.query(
      `UPDATE listings
       SET status = 'active', is_published = TRUE, updated_at = NOW()
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
       RETURNING *`,
      [listingId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Listing not found' });
    }

    return res.json({ success: true, listing: result.rows[0] });
  } catch (error: unknown) {
    console.error('Publish listing error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to publish listing',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

router.post('/listings/:id/images', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.user_id;
  const listingId = Number(req.params.id);
  const body = (req.body ?? {}) as ListingImageUploadRequestBody;

  if (!userId) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  if (!Number.isInteger(listingId)) {
    return res.status(400).json({ success: false, error: 'Invalid listing id' });
  }

  try {
    const listingResult = await MontoitDB.query(
      'SELECT id FROM listings WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [listingId, userId]
    );

    if (listingResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Listing not found' });
    }

    const collectionResult = await MontoitDB.query(
      `INSERT INTO image_collections (entity_type, entity_id, name, created_at, updated_at)
       VALUES ('listing', $1, $2, NOW(), NOW())
       RETURNING id`,
      [String(listingId), body.name ?? 'Listing images']
    );

    const collectionId = collectionResult.rows[0].id;

    await MontoitDB.query(
      'UPDATE listings SET image_collection_id = $1, updated_at = NOW() WHERE id = $2',
      [collectionId, listingId]
    );

    const images = Array.isArray(body.images) ? body.images : [];
    const insertedImages = [] as Array<Record<string, unknown>>;
    const bucketName = body.bucket ?? process.env.AWS_S3_BUCKET ?? 'property-images';

    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      return res.status(500).json({
        success: false,
        error: 'S3 credentials are not configured'
      });
    }

    for (const [index, image] of images.entries()) {
      const filename = image.fileName ?? image.name ?? `image-${index + 1}`;
      const objectKey = `listings/${listingId}/${Date.now()}-${index + 1}-${filename}`;
      const contentType = image.contentType ?? 'application/octet-stream';
      const uploadUrl = await buildPresignedPutUrl(bucketName, objectKey, contentType);

      const imageResult = await MontoitDB.query(
        `INSERT INTO collection_images (collection_id, bucket, object_key, sort_order, created_at)
         VALUES ($1, $2, $3, $4, NOW())
         RETURNING id, collection_id, bucket, object_key, sort_order, created_at`,
        [collectionId, bucketName, objectKey, index]
      );

      insertedImages.push({
        id: imageResult.rows[0].id,
        bucket: bucketName,
        object_key: objectKey,
        file_name: filename,
        sort_order: index,
        upload_url: uploadUrl,
        view_url: await buildPresignedGetUrl(bucketName, objectKey)
      });
    }

    return res.status(201).json({
      success: true,
      collection_id: collectionId,
      listing_id: listingId,
      images: insertedImages
    });
  } catch (error: unknown) {
    console.error('Upload listing images error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to upload listing images',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

router.get('/listings/:id', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.user_id;
  const listingId = Number(req.params.id);

  if (!userId) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  if (!Number.isInteger(listingId)) {
    return res.status(400).json({ success: false, error: 'Invalid listing id' });
  }

  try {
    const result = await MontoitDB.query(
      `SELECT * FROM listings
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [listingId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Listing not found' });
    }

    const listing = result.rows[0];
    const collectionResult = await MontoitDB.query(
      `SELECT ci.bucket, ci.object_key
       FROM collection_images ci
       JOIN image_collections ic ON ic.id = ci.collection_id
       WHERE ic.id = $1
       ORDER BY ci.sort_order ASC, ci.created_at ASC`,
      [listing.image_collection_id]
    );

    const images = [] as Array<Record<string, unknown>>;
    const bucketName = process.env.AWS_S3_BUCKET ?? 'property-images';

    for (const row of collectionResult.rows) {
      const viewUrl = await buildPresignedGetUrl(bucketName, row.object_key);
      images.push({
        bucket: row.bucket,
        object_key: row.object_key,
        url: viewUrl
      });
    }

    return res.json({ success: true, listing: { ...listing, images } });
  } catch (error: unknown) {
    console.error('Get listing error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch listing',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
