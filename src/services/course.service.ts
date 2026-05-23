import {
  and,
  asc,
  desc,
  eq,
  inArray,
  lte,
  ne,
  sql,
  type SQL,
} from 'drizzle-orm';
import { db } from '../config/db';
import { ApiError } from '../lib/api-error';
import { users } from '../models/user.model';
import { ptProfiles } from '../models/pt.model';
import {
  courseLessons,
  courseModules,
  courses,
  enrollments,
  type Course,
} from '../models/course.model';
import type {
  CourseCurriculumBody,
  CreateCourseBody,
  DiscoverCoursesQuery,
  ListOwnCoursesQuery,
  ListPurchasedQuery,
  PatchCourseBody,
} from '../validations/course.validation';

export class CourseError extends ApiError {}

type CourseStatusDb = 'draft' | 'published' | 'archived';
type ApiCourseStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
type EnrollmentStatusDb = 'active' | 'completed' | 'refunded';
type ApiEnrollmentStatus = 'ACTIVE' | 'COMPLETED' | 'REFUNDED';

const toApiCourseStatus = (s: CourseStatusDb): ApiCourseStatus =>
  s.toUpperCase() as ApiCourseStatus;
const toApiEnrollmentStatus = (s: EnrollmentStatusDb): ApiEnrollmentStatus =>
  s.toUpperCase() as ApiEnrollmentStatus;

const PT_BIO_EXCERPT_CHARS = 150;

// ── Response shapes ───────────────────────────────────────────
export interface CourseSummary {
  id: string;
  title: string;
  status: ApiCourseStatus;
  priceVnd: number;
  durationDays: number;
  tags: string[];
  totalLessons: number;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  createdAt: string;
}

export interface CourseLessonView {
  id: string;
  title: string;
  youtubeVideoId: string | null;
  durationMin: number;
  displayOrder: number;
}

export interface CourseModuleView {
  id: string;
  title: string;
  displayOrder: number;
  lessons: CourseLessonView[];
}

export interface PtExcerpt {
  id: string;
  fullName: string;
  bioExcerpt: string;
  specialties: string[];
}

export interface OwnCourseDetail {
  id: string;
  title: string;
  description: string;
  status: ApiCourseStatus;
  priceVnd: number;
  durationDays: number;
  tags: string[];
  thumbnailUrl: string | null;
  totalLessons: number;
  publishedAt: string | null;
  archivedAt: string | null;
  modules: CourseModuleView[];
  createdAt: string;
  updatedAt: string;
}

export interface PublicCourseDetail {
  id: string;
  title: string;
  description: string;
  priceVnd: number;
  durationDays: number;
  tags: string[];
  thumbnailUrl: string | null;
  totalLessons: number;
  publishedAt: string | null;
  modules: CourseModuleView[];
  pt: PtExcerpt;
}

export interface DiscoverCourseItem {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  priceVnd: number;
  durationDays: number;
  tags: string[];
  totalLessons: number;
  publishedAt: string | null;
  pt: PtExcerpt;
}

export interface PurchasedCourseItem {
  enrollmentId: string;
  courseId: string;
  title: string;
  thumbnailUrl: string | null;
  ptId: string;
  ptFullName: string;
  status: ApiEnrollmentStatus;
  enrolledAt: string;
  totalLessons: number;
  durationDays: number;
}

export interface Page<T> {
  items: T[];
  totalItems: number;
}

// ── Mappers ───────────────────────────────────────────────────
const mapCourseSummary = (c: Course): CourseSummary => ({
  id: c.id,
  title: c.title,
  status: toApiCourseStatus(c.status),
  priceVnd: c.priceVnd,
  durationDays: c.durationDays,
  tags: c.tags,
  totalLessons: c.totalLessons,
  thumbnailUrl: c.thumbnailUrl,
  publishedAt: c.publishedAt ? c.publishedAt.toISOString() : null,
  createdAt: c.createdAt.toISOString(),
});

const buildModulesView = async (
  courseId: string,
): Promise<CourseModuleView[]> => {
  const moduleRows = await db
    .select()
    .from(courseModules)
    .where(eq(courseModules.courseId, courseId))
    .orderBy(asc(courseModules.displayOrder));

  if (moduleRows.length === 0) return [];

  const moduleIds = moduleRows.map((m) => m.id);
  const lessonRows = await db
    .select()
    .from(courseLessons)
    .where(inArray(courseLessons.moduleId, moduleIds))
    .orderBy(asc(courseLessons.displayOrder));

  const lessonsByModule = new Map<string, CourseLessonView[]>();
  for (const m of moduleRows) lessonsByModule.set(m.id, []);
  for (const l of lessonRows) {
    lessonsByModule.get(l.moduleId)!.push({
      id: l.id,
      title: l.title,
      youtubeVideoId: l.youtubeVideoId,
      durationMin: l.durationMin,
      displayOrder: l.displayOrder,
    });
  }

  return moduleRows.map((m) => ({
    id: m.id,
    title: m.title,
    displayOrder: m.displayOrder,
    lessons: lessonsByModule.get(m.id) ?? [],
  }));
};

const courseHasEnrollments = async (courseId: string): Promise<boolean> => {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(enrollments)
    .where(
      and(
        eq(enrollments.courseId, courseId),
        ne(enrollments.status, 'refunded'),
      ),
    );
  return (row?.n ?? 0) > 0;
};

// ── 1. createCourse ───────────────────────────────────────────
export const createCourse = async (
  ptId: string,
  input: CreateCourseBody,
): Promise<CourseSummary> => {
  const totalLessons = input.modules.reduce(
    (s, m) => s + m.lessons.length,
    0,
  );

  return await db.transaction(async (tx) => {
    const [course] = await tx
      .insert(courses)
      .values({
        ptId,
        title: input.title,
        description: input.description,
        thumbnailUrl: input.thumbnailUrl ?? null,
        priceVnd: input.priceVnd,
        durationDays: input.durationDays,
        tags: input.tags ?? [],
        status: 'draft',
        totalLessons,
      })
      .returning();

    if (!course) {
      throw new CourseError(500, 'INTERNAL_ERROR', 'Failed to create course');
    }

    const insertedModules = await tx
      .insert(courseModules)
      .values(
        input.modules.map((m) => ({
          courseId: course.id,
          title: m.title,
          displayOrder: m.displayOrder,
        })),
      )
      .returning();

    const moduleByOrder = new Map(
      insertedModules.map((m) => [m.displayOrder, m.id]),
    );

    const lessonRows = input.modules.flatMap((m) =>
      m.lessons.map((l) => ({
        moduleId: moduleByOrder.get(m.displayOrder)!,
        title: l.title,
        youtubeVideoId: l.youtubeVideoId ?? null,
        durationMin: l.durationMin ?? 0,
        displayOrder: l.displayOrder,
      })),
    );

    if (lessonRows.length > 0) {
      await tx.insert(courseLessons).values(lessonRows);
    }

    return mapCourseSummary(course);
  });
};

// ── 2. listOwnCourses ─────────────────────────────────────────
export const listOwnCourses = async (
  ptId: string,
  query: ListOwnCoursesQuery,
): Promise<Page<CourseSummary>> => {
  const filters: SQL[] = [eq(courses.ptId, ptId)];
  if (query.status) {
    filters.push(
      eq(courses.status, query.status.toLowerCase() as CourseStatusDb),
    );
  }
  const where = filters.length === 1 ? filters[0] : and(...filters);
  const offset = (query.page - 1) * query.limit;

  const [rows, countRows] = await Promise.all([
    db
      .select()
      .from(courses)
      .where(where)
      .orderBy(desc(courses.createdAt))
      .limit(query.limit)
      .offset(offset),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(courses)
      .where(where),
  ]);

  return {
    items: rows.map(mapCourseSummary),
    totalItems: countRows[0]?.n ?? 0,
  };
};

// ── 3. getOwnCourseById ───────────────────────────────────────
export const getOwnCourseById = async (
  ptId: string,
  courseId: string,
): Promise<OwnCourseDetail> => {
  const [c] = await db
    .select()
    .from(courses)
    .where(and(eq(courses.id, courseId), eq(courses.ptId, ptId)))
    .limit(1);

  if (!c) {
    // Don't leak existence of other PTs' courses.
    throw new CourseError(404, 'COURSE_NOT_FOUND', 'Course not found');
  }

  const modules = await buildModulesView(c.id);

  return {
    id: c.id,
    title: c.title,
    description: c.description,
    status: toApiCourseStatus(c.status),
    priceVnd: c.priceVnd,
    durationDays: c.durationDays,
    tags: c.tags,
    thumbnailUrl: c.thumbnailUrl,
    totalLessons: c.totalLessons,
    publishedAt: c.publishedAt ? c.publishedAt.toISOString() : null,
    archivedAt: c.archivedAt ? c.archivedAt.toISOString() : null,
    modules,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
};

// ── 4. patchCourse ────────────────────────────────────────────
export const patchCourse = async (
  ptId: string,
  courseId: string,
  patch: PatchCourseBody,
): Promise<CourseSummary> => {
  const [existing] = await db
    .select()
    .from(courses)
    .where(and(eq(courses.id, courseId), eq(courses.ptId, ptId)))
    .limit(1);

  if (!existing) {
    throw new CourseError(404, 'COURSE_NOT_FOUND', 'Course not found');
  }

  const touchesLocked =
    patch.priceVnd !== undefined || patch.durationDays !== undefined;
  if (touchesLocked && (await courseHasEnrollments(courseId))) {
    throw new CourseError(
      409,
      'COURSE_LOCKED_BY_ENROLLMENTS',
      'Price and duration cannot change once the course has enrollments',
    );
  }

  const set: Partial<typeof courses.$inferInsert> = { updatedAt: new Date() };
  if (patch.title !== undefined) set.title = patch.title;
  if (patch.description !== undefined) set.description = patch.description;
  if (patch.thumbnailUrl !== undefined) set.thumbnailUrl = patch.thumbnailUrl;
  if (patch.priceVnd !== undefined) set.priceVnd = patch.priceVnd;
  if (patch.durationDays !== undefined) set.durationDays = patch.durationDays;
  if (patch.tags !== undefined) set.tags = patch.tags;

  const [updated] = await db
    .update(courses)
    .set(set)
    .where(eq(courses.id, courseId))
    .returning();

  return mapCourseSummary(updated!);
};

// ── 5. replaceCurriculum ──────────────────────────────────────
export const replaceCurriculum = async (
  ptId: string,
  courseId: string,
  body: CourseCurriculumBody,
): Promise<OwnCourseDetail> => {
  const [existing] = await db
    .select({ id: courses.id })
    .from(courses)
    .where(and(eq(courses.id, courseId), eq(courses.ptId, ptId)))
    .limit(1);

  if (!existing) {
    throw new CourseError(404, 'COURSE_NOT_FOUND', 'Course not found');
  }

  if (await courseHasEnrollments(courseId)) {
    throw new CourseError(
      409,
      'COURSE_LOCKED_BY_ENROLLMENTS',
      'Curriculum cannot change once the course has enrollments',
    );
  }

  const totalLessons = body.modules.reduce(
    (s, m) => s + m.lessons.length,
    0,
  );

  await db.transaction(async (tx) => {
    // CASCADE on course_modules.course_id removes lessons too.
    await tx.delete(courseModules).where(eq(courseModules.courseId, courseId));

    const insertedModules = await tx
      .insert(courseModules)
      .values(
        body.modules.map((m) => ({
          courseId,
          title: m.title,
          displayOrder: m.displayOrder,
        })),
      )
      .returning();

    const moduleByOrder = new Map(
      insertedModules.map((m) => [m.displayOrder, m.id]),
    );

    const lessonRows = body.modules.flatMap((m) =>
      m.lessons.map((l) => ({
        moduleId: moduleByOrder.get(m.displayOrder)!,
        title: l.title,
        youtubeVideoId: l.youtubeVideoId ?? null,
        durationMin: l.durationMin ?? 0,
        displayOrder: l.displayOrder,
      })),
    );

    if (lessonRows.length > 0) {
      await tx.insert(courseLessons).values(lessonRows);
    }

    await tx
      .update(courses)
      .set({ totalLessons, updatedAt: new Date() })
      .where(eq(courses.id, courseId));
  });

  return getOwnCourseById(ptId, courseId);
};

// ── 6. publishCourse ──────────────────────────────────────────
export const publishCourse = async (
  ptId: string,
  courseId: string,
): Promise<CourseSummary> => {
  const [c] = await db
    .select()
    .from(courses)
    .where(and(eq(courses.id, courseId), eq(courses.ptId, ptId)))
    .limit(1);

  if (!c) {
    throw new CourseError(404, 'COURSE_NOT_FOUND', 'Course not found');
  }
  if (c.status !== 'draft') {
    throw new CourseError(
      409,
      'INVALID_COURSE_STATUS_TRANSITION',
      `Cannot publish a ${c.status} course`,
    );
  }
  if (c.totalLessons < 1) {
    throw new CourseError(
      422,
      'CURRICULUM_INCOMPLETE',
      'Course must have at least one lesson before publishing',
    );
  }

  // Find any lessons missing a YouTube video.
  const offending = await db
    .select({
      lessonId: courseLessons.id,
      lessonTitle: courseLessons.title,
      moduleTitle: courseModules.title,
    })
    .from(courseLessons)
    .innerJoin(courseModules, eq(courseModules.id, courseLessons.moduleId))
    .where(
      and(
        eq(courseModules.courseId, courseId),
        sql`${courseLessons.youtubeVideoId} IS NULL`,
      ),
    );

  if (offending.length > 0) {
    const err = new CourseError(
      422,
      'CURRICULUM_INCOMPLETE',
      'Cannot publish: some lessons are missing YouTube videos',
    );
    (err as CourseError & { details: unknown }).details = offending;
    throw err;
  }

  const publishedAt = new Date();
  const [updated] = await db
    .update(courses)
    .set({ status: 'published', publishedAt, updatedAt: publishedAt })
    .where(eq(courses.id, courseId))
    .returning();

  return mapCourseSummary(updated!);
};

// ── 7. archiveCourse ──────────────────────────────────────────
export const archiveCourse = async (
  ptId: string,
  courseId: string,
): Promise<CourseSummary> => {
  const [c] = await db
    .select()
    .from(courses)
    .where(and(eq(courses.id, courseId), eq(courses.ptId, ptId)))
    .limit(1);

  if (!c) {
    throw new CourseError(404, 'COURSE_NOT_FOUND', 'Course not found');
  }
  if (c.status === 'archived') {
    throw new CourseError(
      409,
      'INVALID_COURSE_STATUS_TRANSITION',
      'Course is already archived',
    );
  }

  const archivedAt = new Date();
  const [updated] = await db
    .update(courses)
    .set({ status: 'archived', archivedAt, updatedAt: archivedAt })
    .where(eq(courses.id, courseId))
    .returning();

  return mapCourseSummary(updated!);
};

// ── 8. discoverCourses ────────────────────────────────────────
const buildPtExcerpt = (
  ptId: string,
  ptFullName: string,
  ptBio: string | null,
  ptSpecialties: string[] | null,
): PtExcerpt => ({
  id: ptId,
  fullName: ptFullName,
  bioExcerpt: ptBio ? ptBio.slice(0, PT_BIO_EXCERPT_CHARS) : '',
  specialties: ptSpecialties ?? [],
});

export const discoverCourses = async (
  query: DiscoverCoursesQuery,
): Promise<Page<DiscoverCourseItem>> => {
  const filters: SQL[] = [eq(courses.status, 'published')];

  if (query.tag) {
    filters.push(sql`${query.tag} = ANY(${courses.tags})`);
  }
  if (query.ptId) filters.push(eq(courses.ptId, query.ptId));
  if (query.maxPriceVnd !== undefined) {
    filters.push(lte(courses.priceVnd, query.maxPriceVnd));
  }
  if (query.search) {
    filters.push(sql`(
      similarity(${courses.title}, ${query.search}) > 0.2
      OR ${courses.title} ILIKE '%' || ${query.search} || '%'
    )`);
  }

  const where = filters.length === 1 ? filters[0] : and(...filters);
  const offset = (query.page - 1) * query.limit;

  const baseSelect = db
    .select({
      id: courses.id,
      title: courses.title,
      thumbnailUrl: courses.thumbnailUrl,
      priceVnd: courses.priceVnd,
      durationDays: courses.durationDays,
      tags: courses.tags,
      totalLessons: courses.totalLessons,
      publishedAt: courses.publishedAt,
      ptId: courses.ptId,
      ptFullName: users.fullName,
      ptBio: ptProfiles.bio,
      ptSpecialties: ptProfiles.specialties,
    })
    .from(courses)
    .innerJoin(users, eq(users.id, courses.ptId))
    // LEFT JOIN — defensive, though every PT should have a profile.
    .leftJoin(ptProfiles, eq(ptProfiles.userId, courses.ptId))
    .where(where)
    .limit(query.limit)
    .offset(offset);

  const rowsPromise = query.search
    ? baseSelect.orderBy(
        desc(
          sql<number>`GREATEST(similarity(${courses.title}, ${query.search}), 0)`,
        ),
        desc(courses.publishedAt),
      )
    : baseSelect.orderBy(desc(courses.publishedAt));

  const [rows, countRows] = await Promise.all([
    rowsPromise,
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(courses)
      .where(where),
  ]);

  const items: DiscoverCourseItem[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    thumbnailUrl: r.thumbnailUrl,
    priceVnd: r.priceVnd,
    durationDays: r.durationDays,
    tags: r.tags,
    totalLessons: r.totalLessons,
    publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
    pt: buildPtExcerpt(r.ptId, r.ptFullName, r.ptBio, r.ptSpecialties),
  }));

  return { items, totalItems: countRows[0]?.n ?? 0 };
};

// ── 9. getPublicCourseDetail ──────────────────────────────────
export const getPublicCourseDetail = async (
  courseId: string,
): Promise<PublicCourseDetail> => {
  const [row] = await db
    .select({
      id: courses.id,
      title: courses.title,
      description: courses.description,
      thumbnailUrl: courses.thumbnailUrl,
      priceVnd: courses.priceVnd,
      durationDays: courses.durationDays,
      tags: courses.tags,
      totalLessons: courses.totalLessons,
      publishedAt: courses.publishedAt,
      ptId: courses.ptId,
      ptFullName: users.fullName,
      ptBio: ptProfiles.bio,
      ptSpecialties: ptProfiles.specialties,
    })
    .from(courses)
    .innerJoin(users, eq(users.id, courses.ptId))
    .leftJoin(ptProfiles, eq(ptProfiles.userId, courses.ptId))
    .where(and(eq(courses.id, courseId), eq(courses.status, 'published')))
    .limit(1);

  if (!row) {
    throw new CourseError(404, 'COURSE_NOT_FOUND', 'Course not found');
  }

  const modules = await buildModulesView(row.id);

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    priceVnd: row.priceVnd,
    durationDays: row.durationDays,
    tags: row.tags,
    thumbnailUrl: row.thumbnailUrl,
    totalLessons: row.totalLessons,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    modules,
    pt: buildPtExcerpt(row.ptId, row.ptFullName, row.ptBio, row.ptSpecialties),
  };
};

// ── 10. listPurchasedCourses ──────────────────────────────────
export const listPurchasedCourses = async (
  userId: string,
  query: ListPurchasedQuery,
): Promise<Page<PurchasedCourseItem>> => {
  const where = and(
    eq(enrollments.userId, userId),
    ne(enrollments.status, 'refunded'),
  );
  const offset = (query.page - 1) * query.limit;

  const [rows, countRows] = await Promise.all([
    db
      .select({
        enrollmentId: enrollments.id,
        courseId: courses.id,
        title: courses.title,
        thumbnailUrl: courses.thumbnailUrl,
        ptId: courses.ptId,
        ptFullName: users.fullName,
        status: enrollments.status,
        enrolledAt: enrollments.enrolledAt,
        totalLessons: courses.totalLessons,
        durationDays: courses.durationDays,
      })
      .from(enrollments)
      .innerJoin(courses, eq(courses.id, enrollments.courseId))
      .innerJoin(users, eq(users.id, courses.ptId))
      .where(where)
      .orderBy(desc(enrollments.enrolledAt))
      .limit(query.limit)
      .offset(offset),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(enrollments)
      .where(where),
  ]);

  return {
    items: rows.map((r) => ({
      enrollmentId: r.enrollmentId,
      courseId: r.courseId,
      title: r.title,
      thumbnailUrl: r.thumbnailUrl,
      ptId: r.ptId,
      ptFullName: r.ptFullName,
      status: toApiEnrollmentStatus(r.status),
      enrolledAt: r.enrolledAt.toISOString(),
      totalLessons: r.totalLessons,
      durationDays: r.durationDays,
    })),
    totalItems: countRows[0]?.n ?? 0,
  };
};

// ── Shared helpers for the payment module ─────────────────────

/**
 * Resolve a published course's price for checkout. Throws COURSE_NOT_FOUND
 * for missing/draft/archived courses (don't leak status) and ALREADY_ENROLLED
 * if this user already holds an active/completed enrollment.
 */
export const resolvePtCoursePrice = async (
  userId: string,
  courseId: string,
): Promise<{ priceVnd: number; label: string }> => {
  const [c] = await db
    .select({
      id: courses.id,
      title: courses.title,
      priceVnd: courses.priceVnd,
    })
    .from(courses)
    .where(and(eq(courses.id, courseId), eq(courses.status, 'published')))
    .limit(1);

  if (!c) {
    throw new CourseError(
      404,
      'COURSE_NOT_FOUND',
      'Course not found or not published',
    );
  }

  const [existing] = await db
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(
      and(
        eq(enrollments.userId, userId),
        eq(enrollments.courseId, courseId),
        ne(enrollments.status, 'refunded'),
      ),
    )
    .limit(1);

  if (existing) {
    throw new CourseError(
      409,
      'ALREADY_ENROLLED',
      'You are already enrolled in this course',
    );
  }

  return { priceVnd: c.priceVnd, label: c.title.slice(0, 100) };
};
