import multer from 'multer';
import { ApiError } from './api-error';

interface UploadErrorOptions {
  /** Expected multipart field name, e.g. "avatar" — surfaced on INVALID_FIELD_NAME. */
  fieldName: string;
  /** Human-readable size cap, e.g. "5 MB" — surfaced on FILE_TOO_LARGE. */
  maxSizeLabel: string;
}

/**
 * Converts a stashed `req.uploadError` (set by uploadSingle/uploadVideoSingle in
 * upload.middleware.ts — no global error handler exists) into the standard
 * envelope's ApiError. Single source of truth for all upload paths.
 *
 * Returns:
 *  - an ApiError(4xx) for any MulterError (every code maps to 400, never 500),
 *  - the error itself when it is already an ApiError (e.g. INVALID_FILE_TYPE
 *    raised by the multer fileFilter),
 *  - null for anything unexpected, so the caller rethrows it and handleError
 *    classifies it as 500 INTERNAL_ERROR (unchanged behaviour).
 */
export const toUploadApiError = (
  err: unknown,
  opts: UploadErrorOptions,
): ApiError | null => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return new ApiError(
        400,
        'FILE_TOO_LARGE',
        `File for field "${opts.fieldName}" must be ${opts.maxSizeLabel} or smaller`,
      );
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return new ApiError(
        400,
        'INVALID_FIELD_NAME',
        `Use field name "${opts.fieldName}"`,
      );
    }
    // Any other MulterError code (LIMIT_FILE_COUNT, LIMIT_PART_COUNT, …) is
    // still a client-shaped error — 400, not a 500.
    return new ApiError(400, 'INVALID_UPLOAD', `Upload rejected: ${err.code}`);
  }

  if (err instanceof ApiError) {
    return err;
  }

  return null;
};
