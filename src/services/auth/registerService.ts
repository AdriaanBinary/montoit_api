import { Request, RequestHandler } from 'express';
import addData from '../../db/add.js';
import prisma from '../../db/prisma.js';
import { createOtp, hashEmailToken, OTP_EXPIRY_MS } from './emailTokens.js';
import { sendVerificationEmail } from '../email/emailService.js';

interface RegisterRequestBody {
  username?: string;
  email?: string;
  password?: string;
  phone?: string;
}

export const register: RequestHandler = async (req, res) => {
  const typedReq = req as Request<{}, {}, RegisterRequestBody>;
  const { username, email, password, phone } = typedReq.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'username, email, and password are required' });
  }

  try {
    const user = await addData.addUser(username, email, password, phone);
    const otp = createOtp();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        verification_token: hashEmailToken(otp),
        verification_expires_at: new Date(Date.now() + OTP_EXPIRY_MS),
        verification_sent_at: new Date()
      }
    });
    await sendVerificationEmail(user.email, otp);

    return res.status(200).json({
      message: 'Sign-up successful. Check your email for the verification code.',
      email_pending_verification: true,
      user: {
        user_id: user.id,
        username: user.username,
        email: user.email,
        phone: user.phone,
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
};
