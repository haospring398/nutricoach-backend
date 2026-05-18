import { randomBytes } from 'crypto';
import { redis } from '../config/redis';

const EMAIL_VERIFY_PREFIX = 'email_verify:';
const PWD_RESET_PREFIX = 'pwd_reset:';

const EMAIL_VERIFY_TTL_SECONDS = 86_400; // 24 hours
const PWD_RESET_TTL_SECONDS = 900; // 15 minutes

export const generateEmailVerificationToken = (): string =>
  'evt_' + randomBytes(32).toString('hex');

export const generatePasswordResetToken = (): string =>
  'prt_' + randomBytes(32).toString('hex');

export const saveEmailVerificationToken = async (
  userId: string,
  token: string,
): Promise<boolean> => {
  try {
    await redis.set(
      EMAIL_VERIFY_PREFIX + token,
      userId,
      'EX',
      EMAIL_VERIFY_TTL_SECONDS,
    );
    return true;
  } catch (err) {
    console.error('[auth-tokens] saveEmailVerificationToken failed:', err);
    return false;
  }
};

export const getEmailVerificationToken = async (
  token: string,
): Promise<string | null> => {
  try {
    return await redis.get(EMAIL_VERIFY_PREFIX + token);
  } catch (err) {
    console.error('[auth-tokens] getEmailVerificationToken failed:', err);
    return null;
  }
};

export const deleteEmailVerificationToken = async (
  token: string,
): Promise<boolean> => {
  try {
    await redis.del(EMAIL_VERIFY_PREFIX + token);
    return true;
  } catch (err) {
    console.error('[auth-tokens] deleteEmailVerificationToken failed:', err);
    return false;
  }
};

export const savePasswordResetToken = async (
  userId: string,
  token: string,
): Promise<boolean> => {
  try {
    await redis.set(
      PWD_RESET_PREFIX + token,
      userId,
      'EX',
      PWD_RESET_TTL_SECONDS,
    );
    return true;
  } catch (err) {
    console.error('[auth-tokens] savePasswordResetToken failed:', err);
    return false;
  }
};

export const getPasswordResetToken = async (
  token: string,
): Promise<string | null> => {
  try {
    return await redis.get(PWD_RESET_PREFIX + token);
  } catch (err) {
    console.error('[auth-tokens] getPasswordResetToken failed:', err);
    return null;
  }
};

export const deletePasswordResetToken = async (
  token: string,
): Promise<boolean> => {
  try {
    await redis.del(PWD_RESET_PREFIX + token);
    return true;
  } catch (err) {
    console.error('[auth-tokens] deletePasswordResetToken failed:', err);
    return false;
  }
};
