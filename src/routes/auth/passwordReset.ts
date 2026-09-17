import express from 'express';
import { z } from 'zod';
import prisma from '../../db/prisma.js';
import { hashPassword } from '../../utils/passwordUtils.js';
import { createResetToken, hasExpired, hashEmailToken, PASSWORD_RESET_EXPIRY_MS } from '../../services/auth/emailTokens.js';
import { sendPasswordResetEmail } from '../../services/email/emailService.js';
import { normalizeEmail } from '../../utils/emailUtils.js';

const router = express.Router();
const genericResponse = { message: 'If an account exists for that email, a password reset link has been sent.' };

const forgotPasswordSchema = z.object({ email: z.string().email() });
const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(6)
});

router.post('/forgot-password', async (req, res) => {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'A valid email is required' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email: normalizeEmail(parsed.data.email) } });
    if (!user) {
      return res.status(200).json(genericResponse);
    }

    const rawToken = createResetToken();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password_reset_token: hashEmailToken(rawToken),
        password_reset_expires_at: new Date(Date.now() + PASSWORD_RESET_EXPIRY_MS)
      }
    });

    const frontendUrl = process.env.FRONTEND_PUBLIC_URL;
    if (!frontendUrl) {
      throw new Error('FRONTEND_PUBLIC_URL is not configured');
    }

    const resetUrl = `${frontendUrl.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(rawToken)}`;
    await sendPasswordResetEmail(user.email, resetUrl);
    return res.status(200).json(genericResponse);
  } catch (error: unknown) {
    console.error('Forgot password error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/reset-password', async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'A valid token and password of at least 6 characters are required' });
  }

  try {
    const user = await prisma.user.findFirst({
      where: { password_reset_token: hashEmailToken(parsed.data.token) }
    });

    if (!user || hasExpired(user.password_reset_expires_at)) {
      return res.status(400).json({ error: 'Invalid or expired password reset link' });
    }

    const password = await hashPassword(parsed.data.password);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password,
        password_reset_token: null,
        password_reset_expires_at: null
      }
    });

    return res.status(200).json({ message: 'Password reset successfully' });
  } catch (error: unknown) {
    console.error('Reset password error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;