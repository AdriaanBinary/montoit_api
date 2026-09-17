import { Resend } from 'resend';

function getEmailConfig(): { client: Resend; from: string } {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || 'onboarding@resend.dev';

  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured');
  }

  return { client: new Resend(apiKey), from };
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const { client, from } = getEmailConfig();
  const { error } = await client.emails.send({ from, to, subject, html });

  if (error) {
    throw new Error(`Email delivery failed: ${error.message}`);
  }
}

export async function sendVerificationEmail(to: string, otp: string): Promise<void> {
  await sendEmail(
    to,
    'Confirm your Ndabo email address',
    `<p>Use this code to confirm your Ndabo email address:</p><p><strong>${otp}</strong></p><p>This code expires in 10 minutes.</p>`
  );
}

export async function sendWelcomeEmail(to: string, username: string): Promise<void> {
  await sendEmail(
    to,
    'Welcome to Ndabo',
    `<p>Welcome to Ndabo, ${username}.</p><p>Your email has been confirmed and your account is ready to use.</p>`
  );
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  await sendEmail(
    to,
    'Reset your Ndabo password',
    `<p>We received a request to reset your Ndabo password.</p><p><a href="${resetUrl}">Reset your password</a></p><p>This link expires in 1 hour. If you did not request this, you can ignore this email.</p>`
  );
}
