import express from 'express';
import { getAutocompleteSuggestions } from '../services/autocompleteService.js';

const router = express.Router();

router.get('/autocomplete', getAutocompleteSuggestions);

export default router;
