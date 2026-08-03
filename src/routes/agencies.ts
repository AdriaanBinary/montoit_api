import express from 'express';
import { createAgency, convertUserToAgent } from '../services/agenciesService.js';
import { checkAuth } from '../utils/authMiddleware.js';

const router = express.Router();

router.post('/agencies', checkAuth, createAgency);
router.post('/agencies/agents/convert', checkAuth, convertUserToAgent);

export default router;
