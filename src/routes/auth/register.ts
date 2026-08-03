import express from 'express';
import { z } from 'zod';
import { registerApiRoute } from '../../docs/swagger.js';
import { register } from '../../services/auth/registerService.js';

const router = express.Router();

const registerBodySchema = z.object({
	username: z.string().min(1),
	email: z.string().email(),
	password: z.string().min(1)
});

const registerUserSchema = z.object({
	user_id: z.string(),
	username: z.string(),
	email: z.string().email(),
	created_at: z.union([z.string(), z.date()])
});

const registerSuccessResponseSchema = z.object({
	message: z.string(),
	token: z.string(),
	user: registerUserSchema
});

const registerErrorResponseSchema = z.object({
	error: z.string(),
	message: z.string().optional()
});

registerApiRoute({
	method: 'post',
	path: '/api/auth/register',
	summary: 'Register a new user',
	tags: ['Auth'],
	request: {
		body: registerBodySchema
	},
	responses: {
		200: { description: 'Registration successful', schema: registerSuccessResponseSchema },
		400: { description: 'Bad request', schema: registerErrorResponseSchema },
		500: { description: 'Internal server error', schema: registerErrorResponseSchema }
	}
});

router.post('/register', (req, res, next) => {
	const parsedBody = registerBodySchema.safeParse(req.body);

	if (!parsedBody.success) {
		return res.status(400).json({
			error: 'username, email, and password are required',
			message: parsedBody.error.issues.map((issue) => issue.message).join(', ')
		});
	}

	req.body = parsedBody.data;
	return register(req, res, next);
});

export default router;
