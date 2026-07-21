import express from 'express';
import { getAutocompleteSuggestions } from '../services/autocompleteService.js';
import { checkAuth } from '../utils/authMiddleware.js';

const router = express.Router();

router.get('/autocomplete', checkAuth, getAutocompleteSuggestions);

export default router;
