import { z } from 'zod';

// The image now arrives as a multipart file (field `image`), not JSON base64 —
// the controller reads req.file and converts it. Only the optional free-text
// question is validated from the body.
export const scanSchema = z
  .object({
    question: z.string().trim().min(1).max(300).optional(),
  })
  .strict();

export type ScanInput = z.infer<typeof scanSchema>;
