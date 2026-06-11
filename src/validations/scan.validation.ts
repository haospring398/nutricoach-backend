import { z } from 'zod';

// Raw base64 (no `data:` prefix — the AI service's visionNode adds the
// `data:image/jpeg;base64,` wrapper itself).
export const scanSchema = z
  .object({
    imageBase64: z.string().min(100, 'imageBase64 must be a base64 image'),
    question: z.string().trim().min(1).max(300).optional(),
  })
  .strict();

export type ScanInput = z.infer<typeof scanSchema>;
