import express from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import getData from '../../db/get.js';

dotenv.config();

const router = express.Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  getData.checkLogin(email, password, (err, user) => {
    const secret = process.env.JWT_KEY;

    if (err) {
      return res.status(500).json({ error: 'Internal server error' });
    }

    if (user) {
      const tokenPayload = { user_id: user.user_id, email: user.email };
      const token = jwt.sign(tokenPayload, secret, { expiresIn: '7d' });
      return res.status(200).json({
        message: 'Login successful',
        token,
        user: {
          user_id: user.user_id,
          username: user.username,
          email: user.email
        }
      });
    }

    return res.status(401).json({ error: 'Invalid email or password' });
  });
});

export default router;
