import express, { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import addData from '../../db/add.js';

dotenv.config();

interface RegisterRequestBody {
  username?: string;
  email?: string;
  password?: string;
}

const router = express.Router();

router.post('/register', async (req: Request<{}, {}, RegisterRequestBody>, res: Response) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'username, email, and password are required' });
  }

  try {
    const user = await addData.addUser(username, email, password);
    const secret = process.env.JWT_KEY;

    if (!secret) {
      throw new Error('JWT_KEY is not defined');
    }

    const tokenPayload = { user_id: user.id, email: user.email };
    const token = jwt.sign(tokenPayload, secret, { expiresIn: '1d' });

    return res.status(200).json({
      message: 'Sign-up successful',
      token,
      user: {
        user_id: user.id,
        username: user.username,
        email: user.email,
        created_at: user.created_at
      }
    });
  } catch (error: unknown) {
    console.error('Register error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
