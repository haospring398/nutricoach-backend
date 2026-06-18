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
 * Verifies a file's leading bytes match its declared (already whitelisted)
 * mimetype, so a spoofed Content-Type cannot slip a non-image/non-video past
 * the fileFilter (which only sees the client-claimed mimetype, not the bytes).
 */
const magicBytesMatch = (buffer: Buffer, mimetype: string): boolean => {
  const b = buffer;
  switch (mimetype) {
    case 'image/jpeg':
      return b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case 'image/png':
      return (
        b.length >= 8 &&
        b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
        b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
      );
    case 'image/webp':
      return (
        b.length >= 12 &&
        b.toString('ascii', 0, 4) === 'RIFF' &&
        b.toString('ascii', 8, 12) === 'WEBP'
      );
    case 'video/mp4':
      return b.length >= 8 && b.toString('ascii', 4, 8) === 'ftyp';
    default:
      return false;
  }
};

// Stash a multer error, OR a magic-byte mismatch as INVALID_FILE_TYPE, on
// req.uploadError — the same contract the controllers already convert (no
// global error handler exists). Skipped for 0-byte files so the controller's
// EMPTY_FILE guard still wins. The buffer guard keeps this safe if a future
// path switches to diskStorage (req.file.buffer would be undefined then —
// see SPEC-upload-hardening CAP-3, which must re-wire sniffing for disk).
const stashUploadError = (req: Request, err: unknown): void => {
  const r = req as Request & { uploadError?: unknown };
  if (err) {
    r.uploadError = err;
  } else if (
    req.file &&
    req.file.size > 0 &&
    req.file.buffer &&
    !magicBytesMatch(req.file.buffer, req.file.mimetype)
  ) {
    r.uploadError = new ApiError(
      400,
      'INVALID_FILE_TYPE',
      'File content does not match its declared type',
    );
  }
};

export const uploadSingle = (fieldName: string) => {
  const handler = upload.single(fieldName);
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res, (err: unknown) => {
      stashUploadError(req, err);
      next();
    });
  };
};

const MAX_VIDEO_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB
const ALLOWED_VIDEO_MIME_TYPES = new Set(['video/mp4']);

const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_VIDEO_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_VIDEO_MIME_TYPES.has(file.mimetype)) {
      cb(
        new ApiError(
          400,
          'INVALID_FILE_TYPE',
          'Only MP4 video is allowed',
        ),
      );
      return;
    }
    cb(null, true);
  },
});

/**
 * Video variant of uploadSingle: 100MB limit, video/mp4 only. Same
 * stash-on-req.uploadError contract (no global error middleware), so the
 * controller converts the error into the standard envelope.
 */
export const uploadVideoSingle = (fieldName: string) => {
  const handler = videoUpload.single(fieldName);
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res, (err: unknown) => {
      stashUploadError(req, err);
      next();
    });
  };
};
