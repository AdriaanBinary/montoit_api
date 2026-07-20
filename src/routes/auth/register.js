import express from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import addData from '../../db/add.js';

dotenv.config();

const router = express.Router();

router.post('/register', (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'username, email, and password are required' });
  }

  addData.addUser(username, email, password, (err, user) => {
    const secret = process.env.JWT_KEY;

    if (err) {
      return res.status(500).json({ error: 'Internal server error: ' + (err.message || err) });
    }

    if (user) {
      const tokenPayload = { user_id: user.user_id, email: user.email };
      const token = jwt.sign(tokenPayload, secret, { expiresIn: '1d' });
      return res.status(200).json({
        message: 'Sign-up successful',
        token,
        user: {
          user_id: user.user_id,
          username: user.username,
          email: user.email,
          created_at: user.created_at
        }
      });
    }

    return res.status(400).json({ error: 'Unable to create user' });
  });
});

export default router;
