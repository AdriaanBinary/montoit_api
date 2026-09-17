import crypto from 'node:crypto';

export const OTP_EXPIRY_MS = 10 * 60 * 1000;
export const PASSWORD_RESET_EXPIRY_MS = 60 * 60 * 1000;

export function createOtp(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

export function createResetToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function hashEmailToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function hasExpired(expiresAt: Date | null | undefined): boolean {
  return !expiresAt || expiresAt.getTime() <= Date.now();
}
