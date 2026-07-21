import express from 'express';
import { register } from '../../services/auth/registerService.js';

const router = express.Router();

router.post('/register', register);

export default router;
