import { Request, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import getData from '../../db/get.js';

interface LoginRequestBody {
  email?: string;
  password?: string;
}

export const login: RequestHandler = async (req, res) => {
  const typedReq = req as Request<{}, {}, LoginRequestBody>;
  const { email, password } = typedReq.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  try {
    const user = await getData.checkLogin(email, password);
    const secret = process.env.JWT_KEY;

    if (!secret) {
      throw new Error('JWT_KEY is not defined');
    }

    if (user) {
      const tokenPayload = { user_id: user.id, email: user.email };
      const token = jwt.sign(tokenPayload, secret, { expiresIn: '7d' });

      return res.status(200).json({
        message: 'Login successful',
        token,
        user: {
          user_id: user.id,
          username: user.username,
          email: user.email
        }
      });
    }

    return res.status(401).json({ error: 'Invalid email or password' });
  } catch (error: unknown) {
    console.error('Login error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
