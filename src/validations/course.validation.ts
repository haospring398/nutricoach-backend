import { z } from 'zod';

const lessonSchema = z.object({
  title: z.string().trim().min(3).max(200),
  youtubeVideoId: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{11}$/, 'Invalid YouTube video ID')
    .nullable()
    .optional(),
  durationMin: z.number().int().min(0).max(600).default(0),
  displayOrder: z.number().int().min(0),
  isPreview: z.boolean().default(false),
});

const moduleSchema = z.object({
  title: z.string().trim().min(3).max(200),
  displayOrder: z.number().int().min(0),
  lessons: z.array(lessonSchema).min(1).max(50),
});

// 0-based, contiguous, no gaps, no duplicates.
const isContiguousOrder = <T extends { displayOrder: number }>(
  arr: T[],
): boolean => {
  const orders = arr.map((x) => x.displayOrder).sort((a, b) => a - b);
  return orders.every((n, i) => n === i);
};

const refineCurriculumOrder = (
  data: { modules: Array<{ displayOrder: number; lessons: Array<{ displayOrder: number }> }> },
  ctx: z.RefinementCtx,
): void => {
  if (!isContiguousOrder(data.modules)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['modules'],
      message: 'Module displayOrder must be 0-based contiguous',
    });
  }
  data.modules.forEach((m, i) => {
    if (!isContiguousOrder(m.lessons)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['modules', i, 'lessons'],
        message: 'Lesson displayOrder must be 0-based contiguous',
      });
    }
  });
};

export const courseCurriculumSchema = z
  .object({
    modules: z.array(moduleSchema).min(1).max(20),
  })
  .superRefine(refineCurriculumOrder);

export const createCourseBodySchema = z
  .object({
    title: z.string().trim().min(3).max(200),
    description: z.string().trim().min(20).max(5000),
    thumbnailUrl: z.string().max(512).nullable().optional(),
    priceVnd: z
      .number()
      .int()
      .min(50000)
      .max(50000000)
      .refine((n) => n % 1000 === 0, 'Price must be multiple of 1000'),
    durationDays: z.number().int().min(1).max(365),
    tags: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
    modules: z.array(moduleSchema).min(1).max(20),
  })
  .superRefine(refineCurriculumOrder);

export const patchCourseBodySchema = z
  .object({
    title: z.string().trim().min(3).max(200).optional(),
    description: z.string().trim().min(20).max(5000).optional(),
    thumbnailUrl: z.string().max(512).nullable().optional(),
    priceVnd: z
      .number()
      .int()
      .min(50000)
      .max(50000000)
      .refine((n) => n % 1000 === 0, 'Price must be multiple of 1000')
      .optional(),
    durationDays: z.number().int().min(1).max(365).optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, {
    message: 'At least one field must be provided',
  });

export const courseIdParamSchema = z.object({
  id: z.string().uuid('course id must be a UUID'),
});

export const lessonVideoParamSchema = z.object({
  id: z.string().uuid('course id must be a UUID'),
  lessonId: z.string().uuid('lesson id must be a UUID'),
});

export const setLessonPreviewBodySchema = z.object({
  isPreview: z.boolean(),
});

export const listOwnCoursesQuerySchema = z.object({
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const discoverCoursesQuerySchema = z.object({
  search: z.string().trim().min(1).max(100).optional(),
  tag: z.string().trim().min(1).max(40).optional(),
  ptId: z.string().uuid().optional(),
  maxPriceVnd: z.coerce.number().int().min(50000).max(50000000).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const listPurchasedQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type CreateCourseBody = z.infer<typeof createCourseBodySchema>;
export type PatchCourseBody = z.infer<typeof patchCourseBodySchema>;
export type SetLessonPreviewBody = z.infer<typeof setLessonPreviewBodySchema>;
export type CourseCurriculumBody = z.infer<typeof courseCurriculumSchema>;
export type ListOwnCoursesQuery = z.infer<typeof listOwnCoursesQuerySchema>;
export type DiscoverCoursesQuery = z.infer<typeof discoverCoursesQuerySchema>;
export type ListPurchasedQuery = z.infer<typeof listPurchasedQuerySchema>;
