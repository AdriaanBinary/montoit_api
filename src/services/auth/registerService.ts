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

  let createdUserId: string | null = null;

  try {
    const user = await addData.addUser(username, email, password, phone);
    createdUserId = user.id;
    const otp = createOtp();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        verification_token: hashEmailToken(otp),
        verification_expires_at: new Date(Date.now() + OTP_EXPIRY_MS),
        verification_sent_at: new Date()
      }
    });
    try {
      await sendVerificationEmail(user.email, otp);
    } catch (emailError: unknown) {
      await prisma.user.delete({ where: { id: user.id } }).catch((cleanupError: unknown) => {
        console.error('Failed to roll back registration after email delivery failure:', cleanupError);
      });
      createdUserId = null;
      console.error('Verification email delivery failed:', emailError);
      return res.status(503).json({
        error: 'Email service unavailable',
        message: 'Could not send the verification email. Please try again.'
      });
    }

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
    if (createdUserId) {
      await prisma.user.delete({ where: { id: createdUserId } }).catch((cleanupError: unknown) => {
        console.error('Failed to roll back registration:', cleanupError);
      });
    }

    console.error('Register error:', error);

    if (error instanceof Error && error.message.includes('already exists')) {
      return res.status(409).json({ error: error.message });
    }

    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
