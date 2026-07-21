import express from 'express';
import {
  createListing,
  getListingById,
  getPublicListingById,
  getPrivateListings,
  publishListing,
  uploadListingImages
} from '../services/listingsService.js';
import { getPublicListings } from '../services/publicListingsService.js';
import { checkAuth } from '../utils/authMiddleware.js';

const router = express.Router();

router.get('/listings/public', getPublicListings);
router.get('/listings/public/:id', getPublicListingById);
router.get('/listings/private', checkAuth, getPrivateListings);
router.post('/listings', checkAuth, createListing);
router.post('/listings/:id/publish', checkAuth, publishListing);
router.post('/listings/:id/images', checkAuth, uploadListingImages);
router.get('/listings/:id', checkAuth, getListingById);

export default router;
