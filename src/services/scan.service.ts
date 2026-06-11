import { createHash } from 'node:crypto';
import { db } from '../config/db';
import { env } from '../config/env';
import { ApiError } from '../lib/api-error';
import { aiFoodScans } from '../models/ai-food-scan.model';
import { getVnDateString, triggerQuest } from './quest.service';
import type { ScanInput } from '../validations/scan.validation';

export class ScanError extends ApiError {}

interface AiInferResponse {
  extraction: unknown;
  retrievedRows: unknown[];
  finalAnswer: string;
}

export interface ScanResult {
  scanId: string;
  extraction: unknown;
  retrievedRows: unknown[];
  finalAnswer: string;
  quest: {
    triggered: boolean;
    pointsAwarded: number;
    totalPoints: number;
  } | null;
}

export async function scanFood(
  userId: string,
  input: ScanInput,
): Promise<ScanResult> {
  // 1. Call the AI microservice (/infer: vision → retrieve → answer).
  let ai: AiInferResponse;
  try {
    const resp = await fetch(`${env.AI_SERVICE_URL}/infer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AI-Secret': env.AI_SERVICE_SECRET,
      },
      body: JSON.stringify({
        imageBase64: input.imageBase64,
        question: input.question,
      }),
    });
    if (!resp.ok) {
      const body = await resp.text();
      throw new ScanError(
        503,
        'AI_SERVICE_UNAVAILABLE',
        `AI service responded ${resp.status}: ${body.slice(0, 200)}`,
      );
    }
    ai = (await resp.json()) as AiInferResponse;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ScanError(503, 'AI_SERVICE_UNAVAILABLE', 'AI service unreachable');
  }

  // 2. Persist the hash only — never the raw base64.
  const imageHash = createHash('sha256')
    .update(input.imageBase64)
    .digest('hex');
  const [row] = await db
    .insert(aiFoodScans)
    .values({
      userId,
      imageHash,
      extraction: ai.extraction,
      matchedRows: ai.retrievedRows,
      finalAnswer: ai.finalAnswer,
    })
    .returning({ id: aiFoodScans.id });

  // 3. Server-side AI_SCAN quest trigger — resolves the TODO in quest.service:
  //    the real scan id is the audit referenceId. The daily cap (3/day) is
  //    enforced inside triggerQuest. A quest failure must never fail the scan.
  let quest: ScanResult['quest'] = null;
  try {
    quest = await triggerQuest(userId, 'AI_SCAN', getVnDateString(), row!.id);
  } catch {
    quest = null;
  }

  return {
    scanId: row!.id,
    extraction: ai.extraction,
    retrievedRows: ai.retrievedRows,
    finalAnswer: ai.finalAnswer,
    quest,
  };
}
