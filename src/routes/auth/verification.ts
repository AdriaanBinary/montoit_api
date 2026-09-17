import express from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import prisma from '../../db/prisma.js';
import { sendVerificationEmail, sendWelcomeEmail } from '../../services/email/emailService.js';
import { createOtp, hasExpired, hashEmailToken, OTP_EXPIRY_MS } from '../../services/auth/emailTokens.js';

const router = express.Router();

const verificationSchema = z.object({
  user_id: z.string().min(1),
  otp: z.string().regex(/^\d{6}$/)
});

router.post('/verify-email', async (req, res) => {
  const parsed = verificationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'user_id and a 6-digit otp are required' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: parsed.data.user_id } });
    if (!user || user.email_verified || hasExpired(user.verification_expires_at) || user.verification_token !== hashEmailToken(parsed.data.otp)) {
      return res.status(400).json({ error: 'Invalid or expired verification code' });
    }

    const verifiedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        email_verified: true,
        email_verified_at: new Date(),
        verification_token: null,
        verification_expires_at: null,
        verification_sent_at: null
      }
    });

    await sendWelcomeEmail(verifiedUser.email, verifiedUser.username);

    const secret = process.env.JWT_KEY;
    if (!secret) {
      throw new Error('JWT_KEY is not defined');
    }

    const token = jwt.sign({ user_id: verifiedUser.id, email: verifiedUser.email }, secret, { expiresIn: '7d' });
    return res.status(200).json({
      message: 'Email verified successfully',
      token,
      user: {
        user_id: verifiedUser.id,
        username: verifiedUser.username,
        email: verifiedUser.email,
        phone: verifiedUser.phone,
        role: verifiedUser.role
      }
    });
  } catch (error: unknown) {
    console.error('Email verification error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/resend-verification', async (req, res) => {
  const parsed = z.object({ user_id: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'user_id is required' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: parsed.data.user_id } });
    const genericResponse = { message: 'If the account needs verification, a new code has been sent.' };
    if (!user || user.email_verified) {
      return res.status(200).json(genericResponse);
    }

    if (user.verification_sent_at && Date.now() - user.verification_sent_at.getTime() < 60_000) {
      return res.status(200).json(genericResponse);
    }

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
    return res.status(200).json(genericResponse);
  } catch (error: unknown) {
    console.error('Resend verification error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;