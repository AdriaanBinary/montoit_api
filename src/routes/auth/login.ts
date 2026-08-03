import express from 'express';
import { z } from 'zod';
import { registerApiRoute } from '../../docs/swagger.js';
import { login } from '../../services/auth/loginService.js';

const router = express.Router();

const loginBodySchema = z.object({
	email: z.string().email(),
	password: z.string().min(1)
});

const authUserSchema = z.object({
	user_id: z.string(),
	username: z.string(),
	email: z.string().email()
});

const loginSuccessResponseSchema = z.object({
	message: z.string(),
	token: z.string(),
	user: authUserSchema
});

const authErrorResponseSchema = z.object({
	error: z.string(),
	message: z.string().optional()
});

registerApiRoute({
	method: 'post',
	path: '/api/auth/login',
	summary: 'Log in a user',
	tags: ['Auth'],
	request: {
		body: loginBodySchema
	},
	responses: {
		200: { description: 'Login successful', schema: loginSuccessResponseSchema },
		400: { description: 'Bad request', schema: authErrorResponseSchema },
		401: { description: 'Unauthorized', schema: authErrorResponseSchema },
		500: { description: 'Internal server error', schema: authErrorResponseSchema }
	}
});

router.post('/login', (req, res, next) => {
	const parsedBody = loginBodySchema.safeParse(req.body);

	if (!parsedBody.success) {
		return res.status(400).json({
			error: 'email and password are required',
			message: parsedBody.error.issues.map((issue) => issue.message).join(', ')
		});
	}

	req.body = parsedBody.data;
	return login(req, res, next);
});

export default router;
