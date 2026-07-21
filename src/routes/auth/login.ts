import express from 'express';
import { login } from '../../services/auth/loginService.js';

const router = express.Router();

router.post('/login', login);

export default router;
