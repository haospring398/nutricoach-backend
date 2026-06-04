import multer from 'multer';
import type { Request, Response, NextFunction } from 'express';
import { ApiError } from '../lib/api-error';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(
        new ApiError(
          400,
          'INVALID_FILE_TYPE',
          'Only JPEG, PNG, and WebP images are allowed',
        ),
      );
      return;
    }
    cb(null, true);
  },
});

/**
 * multer single-file middleware factory.
 *
 * The codebase has no global error-handling middleware (each controller owns
 * its own handleError), so a raw multer middleware calling next(err) would
 * escape the response envelope. Instead we run multer here and stash any error
 * on req.uploadError, then call next() normally — the controller inspects
 * req.uploadError and converts it (LIMIT_FILE_SIZE -> FILE_TOO_LARGE,
 * fileFilter ApiError -> INVALID_FILE_TYPE) into the standard envelope.
 */
export const uploadSingle = (fieldName: string) => {
  const handler = upload.single(fieldName);
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res, (err: unknown) => {
      if (err) {
        (req as Request & { uploadError?: unknown }).uploadError = err;
      }
      next();
    });
  };
};
