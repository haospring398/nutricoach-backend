import type { User } from '../models/user.model';

export type PublicRole = 'USER' | 'PT' | 'ADMIN';
export type PublicTier = 'FREE' | 'PRO';

const ROLE_MAP: Record<User['role'], PublicRole> = {
  user: 'USER',
  pt: 'PT',
  admin: 'ADMIN',
};

export const toPublicRole = (role: User['role']): PublicRole => ROLE_MAP[role];
export const toPublicTier = (tier: User['tier']): PublicTier => tier;
