import { createHash } from 'node:crypto';
import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '../config/db';
import { env } from '../config/env';
import { ApiError } from '../lib/api-error';
import { aiFoodScans } from '../models/ai-food-scan.model';
import { users } from '../models/user.model';
import { getVnDateString, triggerQuest } from './quest.service';

export class ScanError extends ApiError {}

// Loose shape of the AI /scan response. Everything is optional because the
// model's payload varies (structured `extraction`/`extractedFood`, `foods[]`,
// or only a free-text `finalAnswer`) — mapAiScanResult normalizes it.
interface AiScanResponse {
  extraction?: unknown;
  extractedFood?: unknown;
  retrievedRows?: unknown[];
  finalAnswer?: string | null;
}

interface ServiceScanInput {
  imageBase64: string;
  mimeType: string;
  question?: string;
}

export interface ScanResult {
  scanId: string;
  foodName: string;
  calories: number;
  macros: {
    proteinG: number;
    carbsG: number;
    fatG: number;
  };
  confidence: number;
  ingredients: string[];
  portion: string;
  quest: {
    triggered: boolean;
    pointsAwarded: number;
    totalPoints: number;
  } | null;
}

// FREE users may run at most this many scans per calendar day (VN timezone).
const FREE_DAILY_SCAN_LIMIT = 3;

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};

// Normalizes the varied AI /scan payload into the flat structure the mobile app
// consumes. Prefers structured fields in `extraction` (supporting both a direct
// object and a `foods[0]` array), then falls back to regex-parsing the
// free-text `finalAnswer`. Extracted from scanFood so it can be tested in
// isolation.
const mapAiScanResult = (
  ai: AiScanResponse,
): Omit<ScanResult, 'scanId' | 'quest'> => {
  const ext = asRecord(ai.extraction ?? ai.extractedFood);
  const macros = asRecord(ext.macros);
  const text = ai.finalAnswer ?? '';

  const parseRegex = (regex: RegExp): number => {
    const match = text.match(regex);
    return match && match[1] ? parseFloat(match[1]) : 0;
  };

  const calories =
    Number(ext.calories) || parseRegex(/Calories\):\*\*\s*([\d.]+)/i);
  const protein =
    Number(macros.proteinG ?? ext.proteinG) ||
    parseRegex(/Protein\):\*\*\s*([\d.]+)/i);
  const carbs =
    Number(macros.carbsG ?? ext.carbsG) ||
    parseRegex(/Carbohydrate[:)]\*\*\s*([\d.]+)/i);
  const fat =
    Number(macros.fatG ?? ext.fatG) ||
    parseRegex(/Total Fat\):\*\*\s*([\d.]+)/i);

  const foods = Array.isArray(ext.foods) ? ext.foods : [];
  const firstFood = asRecord(foods[0]);

  const foodName =
    (ext.foodName as string) ||
    (firstFood.vietnamese_name as string) ||
    (firstFood.english_name as string) ||
    'Unknown Food';

  const confidence =
    Number(ext.confidence) ||
    (firstFood.confidence ? Number(firstFood.confidence) * 100 : 0);

  const ingredients = Array.isArray(ext.ingredients)
    ? (ext.ingredients as string[])
    : Array.isArray(firstFood.visible_ingredients)
      ? (firstFood.visible_ingredients as string[])
      : [];

  const portion =
    (ext.portion as string) ||
    (firstFood.estimated_portion as string) ||
    '1 phần';

  return {
    foodName,
    calories,
    macros: { proteinG: protein, carbsG: carbs, fatG: fat },
    confidence: Math.round(confidence),
    ingredients,
    portion,
  };
};

export async function scanFood(
  userId: string,
  input: ServiceScanInput,
): Promise<ScanResult> {
  const [user] = await db
    .select({ tier: users.tier })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  // Persist the hash only — never the raw base64 (privacy, Decision B).
  const imageHash = createHash('sha256')
    .update(input.imageBase64)
    .digest('hex');

  // ── Enforce the FREE daily cap and reserve a pending row atomically so
  //    concurrent scans can't both slip past the limit (TOCTOU). Fail-closed:
  //    a missing user or any non-PRO tier is treated as FREE.
  let scanRecordId: string;
  if (!user || user.tier !== 'PRO') {
    // ai_food_scans.created_at is timestamptz, so a VN-midnight boundary is
    // correct here — never setHours() (server clock is UTC).
    const todayStart = new Date(`${getVnDateString()}T00:00:00+07:00`);

    scanRecordId = await db.transaction(async (tx) => {
      const [scanCount] = await tx
        .select({
          count: sql<number>`cast(count(${aiFoodScans.id}) as integer)`,
        })
        .from(aiFoodScans)
        .where(
          and(
            eq(aiFoodScans.userId, userId),
            gte(aiFoodScans.createdAt, todayStart),
          ),
        );

      if (scanCount && scanCount.count >= FREE_DAILY_SCAN_LIMIT) {
        throw new ScanError(
          403,
          'SCAN_LIMIT_REACHED',
          `Free users are limited to ${FREE_DAILY_SCAN_LIMIT} scans per day`,
        );
      }

      const [row] = await tx
        .insert(aiFoodScans)
        .values({
          userId,
          imageHash,
          extraction: { status: 'PENDING' },
          matchedRows: [],
          finalAnswer: null,
        })
        .returning({ id: aiFoodScans.id });

      return row!.id;
    });
  } else {
    // PRO: unlimited, but still reserve a pending row for a consistent shape.
    const [row] = await db
      .insert(aiFoodScans)
      .values({
        userId,
        imageHash,
        extraction: { status: 'PENDING' },
        matchedRows: [],
        finalAnswer: null,
      })
      .returning({ id: aiFoodScans.id });
    scanRecordId = row!.id;
  }

  // ── Call the AI microservice (/scan: vision → retrieve → answer). On any
  //    failure, roll back the pending row and surface AI_SERVICE_UNAVAILABLE
  //    (never a raw 500 — this fixes the Test build's raw-rethrow bug).
  let ai: AiScanResponse;
  try {
    const resp = await fetch(`${env.AI_SERVICE_URL}/scan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AI-Secret': env.AI_SERVICE_SECRET,
      },
      body: JSON.stringify({
        imageBase64: input.imageBase64,
        mimeType: input.mimeType,
        question: input.question,
      }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      console.error(
        'AI_SERVICE_ERROR (/scan):',
        resp.status,
        body.slice(0, 500),
      );
      throw new ScanError(
        503,
        'AI_SERVICE_UNAVAILABLE',
        `AI service responded ${resp.status}: ${body.slice(0, 500)}`,
      );
    }
    ai = (await resp.json()) as AiScanResponse;
  } catch (err) {
    await db.delete(aiFoodScans).where(eq(aiFoodScans.id, scanRecordId));
    if (err instanceof ApiError) throw err;
    console.error('AI /scan unreachable:', err);
    throw new ScanError(503, 'AI_SERVICE_UNAVAILABLE', 'AI service unreachable');
  }

  // ── Fill in the reserved row with the real result.
  await db
    .update(aiFoodScans)
    .set({
      extraction: ai.extraction,
      matchedRows: ai.retrievedRows,
      finalAnswer: ai.finalAnswer,
    })
    .where(eq(aiFoodScans.id, scanRecordId));

  // ── Server-side AI_SCAN quest trigger. A quest failure must never fail the
  //    scan; the daily quest cap is enforced inside triggerQuest.
  let quest: ScanResult['quest'] = null;
  try {
    quest = await triggerQuest(
      userId,
      'AI_SCAN',
      getVnDateString(),
      scanRecordId,
    );
  } catch {
    quest = null;
  }

  return {
    scanId: scanRecordId,
    ...mapAiScanResult(ai),
    quest,
  };
}
