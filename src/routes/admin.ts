import express from 'express';
import { checkAuth, requireAdmin } from '../utils/authMiddleware.js';
import {
  getAdminAuditLogs,
  getAdminAgencies,
  getAdminAgency,
  getAdminListing,
  getAdminListings,
  getAdminOverview,
  reviewAdminAgency,
  getAdminUser,
  getAdminUsers,
  suspendAdminUser,
  unsuspendAdminUser,
  updateAdminListing,
  updateAdminUserRole
} from '../services/adminService.js';

const router = express.Router();

router.use(checkAuth, requireAdmin);

router.get('/admin/overview', getAdminOverview);
router.get('/admin/agencies', getAdminAgencies);
router.get('/admin/agencies/:id', getAdminAgency);
router.post('/admin/agencies/:id/review', express.json(), reviewAdminAgency);
router.get('/admin/users', getAdminUsers);
router.get('/admin/users/:id', getAdminUser);
router.patch('/admin/users/:id/role', express.json(), updateAdminUserRole);
router.post('/admin/users/:id/suspend', express.json(), suspendAdminUser);
router.post('/admin/users/:id/unsuspend', unsuspendAdminUser);
router.get('/admin/listings', getAdminListings);
router.get('/admin/listings/:id', getAdminListing);
router.patch('/admin/listings/:id/moderation', express.json(), updateAdminListing);
router.get('/admin/audit-log', getAdminAuditLogs);

export default router;