import fs from 'fs';
import os from 'os';
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

// Bytes needed to cover every signature checked above (webp needs 12, mp4 8).
const MAGIC_HEAD_BYTES = 12;

// Synchronously read the first `len` bytes of a file. Used for disk-stored
// uploads (video) where req.file has no in-memory buffer. The read is tiny
// (12 bytes) so the sync call is negligible. Returns undefined on any error.
const readHead = (path: string, len: number): Buffer | undefined => {
  let fd: number | undefined;
  try {
    fd = fs.openSync(path, 'r');
    const buf = Buffer.alloc(len);
    const n = fs.readSync(fd, buf, 0, len, 0);
    return buf.subarray(0, n);
  } catch {
    return undefined;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
};

// Stash a multer error, OR a magic-byte mismatch as INVALID_FILE_TYPE, on
// req.uploadError — the same contract the controllers already convert (no
// global error handler exists). Skipped for 0-byte files so the controller's
// EMPTY_FILE guard still wins. Reads the head from the in-memory buffer
// (image, memoryStorage) or from disk (video, diskStorage — CAP-3).
const stashUploadError = (req: Request, err: unknown): void => {
  const r = req as Request & { uploadError?: unknown };
  if (err) {
    r.uploadError = err;
    return;
  }
  if (!req.file || req.file.size === 0) return;

  const head =
    req.file.buffer ??
    (req.file.path ? readHead(req.file.path, MAGIC_HEAD_BYTES) : undefined);

  if (head && !magicBytesMatch(head, req.file.mimetype)) {
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

// CAP-3: video spills to a temp file on disk (bounded RAM) instead of being
// buffered whole in process memory. The temp file is removed on response close
// (see uploadVideoSingle). os.tmpdir() is fine — short-lived, deleted per-request.
const videoUpload = multer({
  dest: os.tmpdir(),
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
      // CAP-3: remove the temp file once the response is done. 'close' fires on
      // normal finish AND on client abort, so this covers every exit path
      // (sniff-reject, validation error, upload success/failure). Best-effort.
      res.on('close', () => {
        const tmpPath = req.file?.path;
        if (tmpPath) fs.unlink(tmpPath, () => {});
      });
      stashUploadError(req, err);
      next();
    });
  };
};
