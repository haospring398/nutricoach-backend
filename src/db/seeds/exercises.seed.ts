import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import { getTableColumns, sql } from 'drizzle-orm';
import { db, pool } from '../../config/db';
import { exercises, type NewExercise } from '../../models/workout.model';

const muscleGroup = z.enum([
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'legs',
  'glutes',
  'core',
  'cardio',
  'full_body',
]);

const exerciseRecordSchema = z.object({
  id: z
    .string()
    .regex(/^ex_[a-z0-9_]+$/, 'id must be a valid slug (ex_...)')
    .max(64),
  nameVi: z.string().min(1).max(200),
  nameEn: z.string().min(1).max(200),
  muscleGroups: z.array(muscleGroup).min(1),
  equipment: z.enum([
    'bodyweight',
    'dumbbell',
    'barbell',
    'machine',
    'kettlebell',
    'band',
    'cable',
    'other',
  ]),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
  caloriesPerMinute: z.number().positive().max(50),
  thumbnailUrl: z.string().nullable().optional(),
  animation2dUrl: z.string().nullable().optional(),
  youtubeVideoId: z.string().max(32).nullable().optional(),
  instructions: z.array(z.string()).nullable().optional(),
  commonMistakes: z.array(z.string()).nullable().optional(),
  variations: z
    .array(z.object({ id: z.string(), name: z.string() }))
    .nullable()
    .optional(),
});

const BATCH_SIZE = 200;

const buildUpsertSet = () => {
  const cols = getTableColumns(exercises);
  const skip = new Set(['id', 'createdAt']);
  const out: Record<string, ReturnType<typeof sql.raw>> = {};
  for (const [tsKey, col] of Object.entries(cols)) {
    if (skip.has(tsKey)) continue;
    out[tsKey] = sql.raw(`excluded."${col.name}"`);
  }
  out.updatedAt = sql.raw('now()');
  return out;
};

const main = async (): Promise<void> => {
  const file = path.resolve('data/seed/exercises.json');
  console.log(`[seed] reading ${file}`);
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;

  if (!Array.isArray(raw)) {
    throw new Error('exercises.json must be a JSON array');
  }

  const rows: NewExercise[] = raw.map((r, i) => {
    const parsed = exerciseRecordSchema.safeParse(r);
    if (!parsed.success) {
      throw new Error(
        `Invalid exercise record at index ${i}: ${parsed.error.errors[0]?.message}`,
      );
    }
    const e = parsed.data;
    return {
      id: e.id,
      nameVi: e.nameVi,
      nameEn: e.nameEn,
      muscleGroups: e.muscleGroups,
      equipment: e.equipment,
      difficulty: e.difficulty,
      caloriesPerMinute: e.caloriesPerMinute.toString(),
      thumbnailUrl: e.thumbnailUrl ?? null,
      animation2dUrl: e.animation2dUrl ?? null,
      youtubeVideoId: e.youtubeVideoId ?? null,
      instructions: e.instructions ?? null,
      commonMistakes: e.commonMistakes ?? null,
      variations: e.variations ?? null,
    };
  });

  console.log(`[seed] upserting ${rows.length} exercises...`);
  await db.transaction(async (tx) => {
    const setOnConflict = buildUpsertSet();
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const slice = rows.slice(i, i + BATCH_SIZE);
      await tx
        .insert(exercises)
        .values(slice)
        .onConflictDoUpdate({ target: exercises.id, set: setOnConflict });
    }
  });

  // Distribution summary (an exercise counts toward each of its muscle groups).
  const dist: Record<string, number> = {};
  for (const r of rows) {
    for (const mg of r.muscleGroups) {
      dist[mg] = (dist[mg] ?? 0) + 1;
    }
  }
  const distStr = Object.entries(dist)
    .sort((a, b) => b[1] - a[1])
    .map(([mg, n]) => `${n} ${mg}`)
    .join(', ');
  console.log(`[seed] Seeded ${rows.length} exercises. Distribution: ${distStr}.`);
};

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('[seed] FAILED:', err);
    await pool.end().catch(() => undefined);
    process.exit(1);
  });
