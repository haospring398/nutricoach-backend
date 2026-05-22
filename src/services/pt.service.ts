import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import { db } from '../config/db';
import { users } from '../models/user.model';
import {
  ptProfiles,
  ptVerifications,
  type PtProfile,
  type PtVerification,
} from '../models/pt.model';
import { ApiError } from '../lib/api-error';
import {
  sendVerificationApprovedEmail,
  sendVerificationRejectedEmail,
} from '../lib/email';
import type {
  ListVerificationsQuery,
  SubmitVerificationBody,
  UpdatePtProfileBody,
} from '../validations/pt.validation';

export class PtError extends ApiError {}

type VerificationStatusDb = 'pending_review' | 'approved' | 'rejected';
type ApiVerificationStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';

const toApiStatus = (s: VerificationStatusDb): ApiVerificationStatus =>
  s.toUpperCase() as ApiVerificationStatus;

const ESTIMATED_REVIEW_HOURS = 48;
const DEFAULT_COMMISSION_PERCENT = 10;

// ── Response shapes ───────────────────────────────────────────
export interface SubmitVerificationResult {
  verificationId: string;
  status: 'PENDING_REVIEW';
  submittedAt: string;
  estimatedReviewHours: number;
}

export type OwnVerificationStatus =
  | { status: 'NONE' }
  | {
      status: ApiVerificationStatus;
      submittedAt: string;
      reviewedAt: string | null;
      rejectReason: string | null;
      requireResubmit: boolean;
    };

interface BankAccount {
  bankCode: string;
  accountNumber: string;
  accountHolder: string;
}

export interface PtProfileView {
  id: string;
  userId: string;
  bio: string;
  specialties: string[];
  yearsOfExperience: number;
  bankAccount: BankAccount;
  commissionPercent: number;
  createdAt: string;
}

export interface VerificationListItem {
  id: string;
  userId: string;
  applicantEmail: string;
  applicantName: string;
  fullName: string;
  status: ApiVerificationStatus;
  specialties: string[];
  yearsOfExperience: number;
  submittedAt: string;
  reviewedAt: string | null;
}

export interface VerificationListResult {
  items: VerificationListItem[];
  totalItems: number;
}

export interface VerificationDetail {
  id: string;
  userId: string;
  applicantEmail: string;
  applicantName: string;
  fullName: string;
  dateOfBirth: string;
  citizenIdNumber: string;
  citizenIdFrontKey: string;
  citizenIdBackKey: string;
  certificates: PtVerification['certificates'];
  specialties: string[];
  yearsOfExperience: number;
  bio: string;
  bankAccount: BankAccount;
  status: ApiVerificationStatus;
  reviewedByAdminId: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  requireResubmit: boolean;
  submittedAt: string;
}

export interface ApproveResult {
  verificationId: string;
  status: 'APPROVED';
  userId: string;
  ptProfileId: string;
  reviewedAt: string;
}

export interface RejectResult {
  verificationId: string;
  status: 'REJECTED';
  reviewedAt: string;
  rejectReason: string;
  requireResubmit: boolean;
}

// ── Mappers ───────────────────────────────────────────────────
const mapProfile = (p: PtProfile): PtProfileView => ({
  id: p.id,
  userId: p.userId,
  bio: p.bio,
  specialties: p.specialties,
  yearsOfExperience: p.yearsOfExperience,
  bankAccount: {
    bankCode: p.bankCode,
    accountNumber: p.bankAccountNumber,
    accountHolder: p.bankAccountHolder,
  },
  commissionPercent: p.commissionPercent,
  createdAt: p.createdAt.toISOString(),
});

// ── 1. submitVerification ─────────────────────────────────────
export const submitVerification = async (
  userId: string,
  input: SubmitVerificationBody,
): Promise<SubmitVerificationResult> => {
  const [user] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new PtError(404, 'USER_NOT_FOUND', 'User not found');
  }
  if (user.role === 'pt') {
    throw new PtError(409, 'ALREADY_PT', 'You are already a PT');
  }

  const [pending] = await db
    .select({ id: ptVerifications.id })
    .from(ptVerifications)
    .where(
      and(
        eq(ptVerifications.userId, userId),
        eq(ptVerifications.status, 'pending_review'),
      ),
    )
    .limit(1);

  if (pending) {
    throw new PtError(
      409,
      'VERIFICATION_PENDING',
      'You already have a pending application',
    );
  }

  const [row] = await db
    .insert(ptVerifications)
    .values({
      userId,
      fullName: input.fullName,
      dateOfBirth: input.dateOfBirth.toISOString().slice(0, 10),
      citizenIdNumber: input.citizenIdNumber,
      citizenIdFrontKey: input.citizenIdFrontKey,
      citizenIdBackKey: input.citizenIdBackKey,
      certificates: input.certificates,
      specialties: input.specialties,
      yearsOfExperience: input.yearsOfExperience,
      bio: input.bio,
      bankCode: input.bankAccount.bankCode,
      bankAccountNumber: input.bankAccount.accountNumber,
      bankAccountHolder: input.bankAccount.accountHolder,
    })
    .returning();

  if (!row) {
    throw new PtError(
      500,
      'INTERNAL_ERROR',
      'Failed to create verification',
    );
  }

  return {
    verificationId: row.id,
    status: 'PENDING_REVIEW',
    submittedAt: row.submittedAt.toISOString(),
    estimatedReviewHours: ESTIMATED_REVIEW_HOURS,
  };
};

// ── 2. getOwnVerificationStatus ───────────────────────────────
export const getOwnVerificationStatus = async (
  userId: string,
): Promise<OwnVerificationStatus> => {
  const [v] = await db
    .select()
    .from(ptVerifications)
    .where(eq(ptVerifications.userId, userId))
    .orderBy(desc(ptVerifications.submittedAt))
    .limit(1);

  if (!v) {
    return { status: 'NONE' };
  }

  return {
    status: toApiStatus(v.status),
    submittedAt: v.submittedAt.toISOString(),
    reviewedAt: v.reviewedAt ? v.reviewedAt.toISOString() : null,
    rejectReason: v.status === 'rejected' ? v.reviewNote : null,
    requireResubmit: v.requireResubmit ?? false,
  };
};

// ── 3. getPtProfile ───────────────────────────────────────────
export const getPtProfile = async (
  userId: string,
): Promise<PtProfileView> => {
  const [p] = await db
    .select()
    .from(ptProfiles)
    .where(eq(ptProfiles.userId, userId))
    .limit(1);

  if (!p) {
    throw new PtError(404, 'PT_PROFILE_NOT_FOUND', 'PT profile not found');
  }
  return mapProfile(p);
};

// ── 4. updatePtProfile ────────────────────────────────────────
export const updatePtProfile = async (
  userId: string,
  patch: UpdatePtProfileBody,
): Promise<PtProfileView> => {
  const [existing] = await db
    .select({ id: ptProfiles.id })
    .from(ptProfiles)
    .where(eq(ptProfiles.userId, userId))
    .limit(1);

  if (!existing) {
    throw new PtError(404, 'PT_PROFILE_NOT_FOUND', 'PT profile not found');
  }

  // commissionPercent is intentionally NOT editable here (admin-only later).
  const set: Partial<typeof ptProfiles.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (patch.bio !== undefined) set.bio = patch.bio;
  if (patch.specialties !== undefined) set.specialties = patch.specialties;
  if (patch.yearsOfExperience !== undefined) {
    set.yearsOfExperience = patch.yearsOfExperience;
  }
  if (patch.bankAccount !== undefined) {
    set.bankCode = patch.bankAccount.bankCode;
    set.bankAccountNumber = patch.bankAccount.accountNumber;
    set.bankAccountHolder = patch.bankAccount.accountHolder;
  }

  const [updated] = await db
    .update(ptProfiles)
    .set(set)
    .where(eq(ptProfiles.userId, userId))
    .returning();

  return mapProfile(updated!);
};

// ── 5. listVerifications (admin) ──────────────────────────────
export const listVerifications = async (
  query: ListVerificationsQuery,
): Promise<VerificationListResult> => {
  const filters: SQL[] = [];
  if (query.status) {
    filters.push(
      eq(
        ptVerifications.status,
        query.status.toLowerCase() as VerificationStatusDb,
      ),
    );
  }
  const where = filters.length === 0 ? undefined : and(...filters);
  const offset = (query.page - 1) * query.limit;

  const [rows, countRows] = await Promise.all([
    db
      .select({
        id: ptVerifications.id,
        userId: ptVerifications.userId,
        fullName: ptVerifications.fullName,
        status: ptVerifications.status,
        specialties: ptVerifications.specialties,
        yearsOfExperience: ptVerifications.yearsOfExperience,
        submittedAt: ptVerifications.submittedAt,
        reviewedAt: ptVerifications.reviewedAt,
        applicantEmail: users.email,
        applicantName: users.fullName,
      })
      .from(ptVerifications)
      .innerJoin(users, eq(users.id, ptVerifications.userId))
      .where(where)
      .orderBy(desc(ptVerifications.submittedAt))
      .limit(query.limit)
      .offset(offset),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(ptVerifications)
      .where(where),
  ]);

  return {
    items: rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      applicantEmail: r.applicantEmail,
      applicantName: r.applicantName,
      fullName: r.fullName,
      status: toApiStatus(r.status),
      specialties: r.specialties,
      yearsOfExperience: r.yearsOfExperience,
      submittedAt: r.submittedAt.toISOString(),
      reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
    })),
    totalItems: countRows[0]?.n ?? 0,
  };
};

// ── 6. getVerificationById (admin) ────────────────────────────
export const getVerificationById = async (
  id: string,
): Promise<VerificationDetail> => {
  const [v] = await db
    .select()
    .from(ptVerifications)
    .where(eq(ptVerifications.id, id))
    .limit(1);

  if (!v) {
    throw new PtError(
      404,
      'VERIFICATION_NOT_FOUND',
      'Verification not found',
    );
  }

  const [applicant] = await db
    .select({ email: users.email, fullName: users.fullName })
    .from(users)
    .where(eq(users.id, v.userId))
    .limit(1);

  return {
    id: v.id,
    userId: v.userId,
    applicantEmail: applicant?.email ?? '',
    applicantName: applicant?.fullName ?? '',
    fullName: v.fullName,
    dateOfBirth: v.dateOfBirth,
    citizenIdNumber: v.citizenIdNumber,
    citizenIdFrontKey: v.citizenIdFrontKey,
    citizenIdBackKey: v.citizenIdBackKey,
    certificates: v.certificates,
    specialties: v.specialties,
    yearsOfExperience: v.yearsOfExperience,
    bio: v.bio,
    bankAccount: {
      bankCode: v.bankCode,
      accountNumber: v.bankAccountNumber,
      accountHolder: v.bankAccountHolder,
    },
    status: toApiStatus(v.status),
    reviewedByAdminId: v.reviewedByAdminId,
    reviewedAt: v.reviewedAt ? v.reviewedAt.toISOString() : null,
    reviewNote: v.reviewNote,
    requireResubmit: v.requireResubmit ?? false,
    submittedAt: v.submittedAt.toISOString(),
  };
};

// ── 7. approveVerification (admin) ────────────────────────────
export const approveVerification = async (
  verificationId: string,
  adminUserId: string,
  note: string | undefined,
): Promise<ApproveResult> => {
  const result = await db.transaction(async (tx) => {
    const [v] = await tx
      .select()
      .from(ptVerifications)
      .where(eq(ptVerifications.id, verificationId))
      .limit(1);

    if (!v) {
      throw new PtError(
        404,
        'VERIFICATION_NOT_FOUND',
        'Verification not found',
      );
    }
    if (v.status !== 'pending_review') {
      throw new PtError(
        409,
        'VERIFICATION_ALREADY_REVIEWED',
        `Verification already ${v.status}`,
      );
    }

    const reviewedAt = new Date();

    await tx
      .update(ptVerifications)
      .set({
        status: 'approved',
        reviewedByAdminId: adminUserId,
        reviewedAt,
        reviewNote: note ?? null,
        updatedAt: reviewedAt,
      })
      .where(eq(ptVerifications.id, verificationId));

    // Snapshot operating data into the new profile. If a profile already
    // exists for this user the unique constraint throws and the whole
    // transaction rolls back — intended (surfaces inconsistent state).
    const [profile] = await tx
      .insert(ptProfiles)
      .values({
        userId: v.userId,
        bio: v.bio,
        specialties: v.specialties,
        yearsOfExperience: v.yearsOfExperience,
        bankCode: v.bankCode,
        bankAccountNumber: v.bankAccountNumber,
        bankAccountHolder: v.bankAccountHolder,
        commissionPercent: DEFAULT_COMMISSION_PERCENT,
        approvedFromVerificationId: verificationId,
      })
      .returning();

    await tx
      .update(users)
      .set({ role: 'pt', updatedAt: reviewedAt })
      .where(eq(users.id, v.userId));

    return { userId: v.userId, profileId: profile!.id, reviewedAt };
  });

  // Fire-and-forget approval email (sendEmail swallows its own errors).
  const [applicant] = await db
    .select({ email: users.email, fullName: users.fullName })
    .from(users)
    .where(eq(users.id, result.userId))
    .limit(1);
  if (applicant) {
    void sendVerificationApprovedEmail(applicant.email, applicant.fullName);
  }

  return {
    verificationId,
    status: 'APPROVED',
    userId: result.userId,
    ptProfileId: result.profileId,
    reviewedAt: result.reviewedAt.toISOString(),
  };
};

// ── 8. rejectVerification (admin) ─────────────────────────────
export const rejectVerification = async (
  verificationId: string,
  adminUserId: string,
  reason: string,
  requireResubmit: boolean,
): Promise<RejectResult> => {
  const result = await db.transaction(async (tx) => {
    const [v] = await tx
      .select()
      .from(ptVerifications)
      .where(eq(ptVerifications.id, verificationId))
      .limit(1);

    if (!v) {
      throw new PtError(
        404,
        'VERIFICATION_NOT_FOUND',
        'Verification not found',
      );
    }
    if (v.status !== 'pending_review') {
      throw new PtError(
        409,
        'VERIFICATION_ALREADY_REVIEWED',
        `Verification already ${v.status}`,
      );
    }

    const reviewedAt = new Date();

    await tx
      .update(ptVerifications)
      .set({
        status: 'rejected',
        reviewedByAdminId: adminUserId,
        reviewedAt,
        reviewNote: reason,
        requireResubmit,
        updatedAt: reviewedAt,
      })
      .where(eq(ptVerifications.id, verificationId));

    return { userId: v.userId, reviewedAt };
  });

  const [applicant] = await db
    .select({ email: users.email, fullName: users.fullName })
    .from(users)
    .where(eq(users.id, result.userId))
    .limit(1);
  if (applicant) {
    void sendVerificationRejectedEmail(
      applicant.email,
      applicant.fullName,
      reason,
      requireResubmit,
    );
  }

  return {
    verificationId,
    status: 'REJECTED',
    reviewedAt: result.reviewedAt.toISOString(),
    rejectReason: reason,
    requireResubmit,
  };
};
