import express, { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import getData from '../../db/get.js';

dotenv.config();

interface LoginRequestBody {
  email?: string;
  password?: string;
}

const router = express.Router();

router.post('/login', async (req: Request<{}, {}, LoginRequestBody>, res: Response) => {
  const { email, password } = req.body;

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
});

export default router;
