import { Resend } from 'resend';
import { logger } from '../../utils/logger.js';

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  })[character] ?? character);
}

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

export async function sendNotification(to: string | null | undefined, subject: string, html: string): Promise<void> {
  if (!to) return;
  try {
    await sendEmail(to, subject, html);
  } catch (error: unknown) {
    logger.error('email.notification_failed', {
      recipient: to,
      subject,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
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

export async function sendListingEnquiryEmail(
  to: string,
  ownerName: string,
  listingTitle: string,
  enquiry: { name: string; email: string; phone?: string | null; message: string }
): Promise<void> {
  await sendNotification(
    to,
    `New enquiry about ${listingTitle}`,
    `<p>Hi ${escapeHtml(ownerName)},</p><p>You received a new enquiry about <strong>${escapeHtml(listingTitle)}</strong>.</p><p><strong>From:</strong> ${escapeHtml(enquiry.name)} (${escapeHtml(enquiry.email)})</p><p><strong>Phone:</strong> ${escapeHtml(enquiry.phone || 'Not provided')}</p><p><strong>Message:</strong></p><p>${escapeHtml(enquiry.message)}</p>`
  );
}

export async function sendAgencyInvitationEmail(to: string, agentName: string, agencyName: string, ownerName: string): Promise<void> {
  await sendNotification(
    to,
    `Invitation to join ${agencyName}`,
    `<p>Hi ${escapeHtml(agentName)},</p><p>${escapeHtml(ownerName)} has invited you to join <strong>${escapeHtml(agencyName)}</strong> on Ndabo.</p><p>Open Ndabo to accept or decline this invitation.</p>`
  );
}

export async function sendAgencyInvitationResponseEmail(to: string, ownerName: string, agentName: string, agencyName: string, accepted: boolean): Promise<void> {
  await sendNotification(
    to,
    `${agentName} ${accepted ? 'accepted' : 'declined'} your agency invitation`,
    `<p>Hi ${escapeHtml(ownerName)},</p><p><strong>${escapeHtml(agentName)}</strong> has ${accepted ? 'accepted' : 'declined'} the invitation to join <strong>${escapeHtml(agencyName)}</strong>.</p>`
  );
}

export async function sendPackageActivationEmail(to: string, username: string, packageName: string, expiresAt: Date): Promise<void> {
  await sendNotification(
    to,
    `${packageName} is now active`,
    `<p>Hi ${escapeHtml(username)},</p><p>Your <strong>${escapeHtml(packageName)}</strong> plan is active.</p><p>It expires on <strong>${escapeHtml(expiresAt.toLocaleString())}</strong>.</p>`
  );
}

export async function sendPackageExpiryReminderEmail(to: string, username: string, packageName: string, expiresAt: Date, daysRemaining: number): Promise<void> {
  await sendNotification(
    to,
    `${packageName} expires in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`,
    `<p>Hi ${escapeHtml(username)},</p><p>Your <strong>${escapeHtml(packageName)}</strong> plan expires on <strong>${escapeHtml(expiresAt.toLocaleString())}</strong>.</p><p>Renew your plan before it expires to keep your package benefits active.</p>`
  );
}

export async function sendAgencyCreatedEmail(to: string, username: string, agencyName: string): Promise<void> {
  await sendNotification(
    to,
    `${agencyName} was created and is awaiting approval`,
    `<p>Hi ${escapeHtml(username)},</p><p>Your agency <strong>${escapeHtml(agencyName)}</strong> has been created and is awaiting approval.</p>`
  );
}

export async function sendAgencyApprovedEmail(to: string, username: string, agencyName: string): Promise<void> {
  await sendNotification(
    to,
    `${agencyName} has been approved`,
    `<p>Hi ${escapeHtml(username)},</p><p>Your agency <strong>${escapeHtml(agencyName)}</strong> has been approved and is now active on Ndabo.</p>`
  );
}
