import prisma from '../db/prisma.js';
import { sendPackageExpiryReminderEmail } from './email/emailService.js';

const REMINDER_DAYS = [7, 3, 1] as const;

interface ExpiringSubscription {
  user_id: string;
  username: string;
  email: string;
  package_name: string;
  subscription_expiry: Date;
}

export async function ensurePackageReminderTable(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS package_expiry_reminders (
      id BIGSERIAL PRIMARY KEY,
      user_id VARCHAR(16) NOT NULL,
      subscription_expiry TIMESTAMPTZ(6) NOT NULL,
      reminder_days INTEGER NOT NULL,
      sent_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, subscription_expiry, reminder_days)
    )
  `);
}

export async function runPackageExpiryReminders(): Promise<void> {
  await ensurePackageReminderTable();

  const subscriptions = await prisma.$queryRaw<ExpiringSubscription[]>`
    SELECT id AS user_id, username, email, subscription AS package_name, subscription_expiry
    FROM users
    WHERE subscription_expiry IS NOT NULL
      AND subscription_expiry > NOW()
      AND subscription_expiry <= NOW() + INTERVAL '7 days'
      AND subscription IS NOT NULL
  `;

  for (const subscription of subscriptions) {
    const remainingDays = Math.ceil(
      (subscription.subscription_expiry.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
    );
    const reminderDays = REMINDER_DAYS.find((days) => remainingDays <= days);
    if (!reminderDays) continue;

    const inserted = await prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO package_expiry_reminders (user_id, subscription_expiry, reminder_days)
      VALUES (${subscription.user_id}, ${subscription.subscription_expiry}, ${reminderDays})
      ON CONFLICT (user_id, subscription_expiry, reminder_days) DO NOTHING
      RETURNING id
    `;

    if (inserted.length > 0) {
      await sendPackageExpiryReminderEmail(
        subscription.email,
        subscription.username,
        subscription.package_name,
        subscription.subscription_expiry,
        reminderDays
      );
    }
  }
}

export async function startPackageExpiryReminderWorker(): Promise<void> {
  try {
    await runPackageExpiryReminders();
  } catch (error: unknown) {
    console.error('Initial package expiry reminder run failed:', error);
  }

  setInterval(() => {
    void runPackageExpiryReminders().catch((error: unknown) => {
      console.error('Package expiry reminder run failed:', error);
    });
  }, 6 * 60 * 60 * 1000);
}
