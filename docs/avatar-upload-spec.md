# Avatar Upload — Claude Code Implementation Prompt

NutriCoach backend. Feature: authenticated avatar upload to Cloudinary, in-place overwrite, stable URL. All decisions below are locked — implement, do not redesign.

---

## 1. Pre-flight reads (do these first)

- `docs/CODEBASE_CONTEXT.md` — §5 Conventions (response envelope, per-controller `handleError`, env-only config, Drizzle-only), §1 folder structure.
- `src/config/env.ts` — Zod env schema + the PayOS block (placement anchor).
- `src/services/payment/payos.client.ts` — singleton pattern to mirror.
- `src/lib/api-error.ts` — `ApiError(status, code, message)` signature.
- `src/models/user.model.ts` — confirm `avatarUrl` column + whether `updatedAt` has `$onUpdate`.
- `src/controllers/users.controller.ts` — confirm the local `sendSuccess` / `handleError` helpers and how the service is imported (namespace `usersService.*` vs named).
- `src/routes/users.routes.ts` — confirm `authenticate` import + how `/me/*` routes are registered.

---

## 2. Hard facts (do not re-derive)

- **Base URL:** `http://192.168.1.13:3000`; prefix `/api/v1`.
- **Column already exists:** `users.avatarUrl` (Drizzle) → `avatar_url` (DB), nullable `varchar`, present since migration `0000`. **No migration needed.**
- **Migrations are at `0014`** — this feature adds none.
- **Env access:** only via `import { env } from '../config/env'`. Never touch `process.env` elsewhere. `env.ts` Zod-validates and exits the process at boot on failure.
- **DB writes:** Drizzle ORM only (`db.update(...).set(...).where(eq(...))`). No raw `pg.Pool.query()`.
- **Errors:** thrown as `ApiError(status, code, message)`; each controller has local `sendSuccess` / `sendError` / `handleError`. There is **no global error middleware** — this drives the multer error plumbing below.
- **Auth:** `authenticate` runs first, sets `req.user = { id, email, role }`. Missing/invalid token → `401 UNAUTHORIZED` before any file is parsed.

---

## 3. Locked decisions

| Item | Decision |
|---|---|
| Storage | Cloudinary, server-side upload |
| Transport | multer `memoryStorage()` → `cloudinary.uploader.upload_stream` |
| `public_id` | `avatar_${userId}` + `overwrite: true` (in-place replace, stable URL, zero orphans) |
| Transform | `width:400, height:400, crop:fill, gravity:face, quality:auto, fetch_format:auto` |
| Folder | `nutricoach/avatars` |
| MIME whitelist | `image/jpeg`, `image/png`, `image/webp` |
| Max size | 5 MB |

**Endpoint:** `POST /api/v1/users/me/avatar` · auth required · `multipart/form-data` · field `avatar` (file)
Returns `200 { success:true, data:{ avatarUrl } }`. Errors: `400 INVALID_FILE_TYPE | FILE_TOO_LARGE | NO_FILE_PROVIDED`, `500 UPLOAD_FAILED`.

**Why the middleware stashes errors instead of throwing:** with no global error handler, a raw multer middleware calling `next(err)` escapes the response envelope. `uploadSingle` runs multer and parks any error on `req.uploadError`, then calls `next()`; the controller converts it (`LIMIT_FILE_SIZE → FILE_TOO_LARGE`, fileFilter `ApiError → INVALID_FILE_TYPE`).

---

## 4. Files to produce

### 4.1 Dependencies

```bash
npm install cloudinary multer
npm install -D @types/multer
```

`cloudinary` v2 bundles its own types; `multer` does not. multer 2.x works with Express 4.

---

### 4.2 `src/config/env.ts` — **MODIFY**

Add three boot-required fields to the Zod schema, next to the PayOS block:

```ts
  // PayOS (existing — placement anchor)
  PAYOS_CLIENT_ID: z.string().min(1),
  PAYOS_API_KEY: z.string().min(1),
  PAYOS_CHECKSUM_KEY: z.string().min(1),

  // Cloudinary (avatar uploads) — boot-required
  CLOUDINARY_CLOUD_NAME: z.string().min(1),
  CLOUDINARY_API_KEY: z.string().min(1),
  CLOUDINARY_API_SECRET: z.string().min(1),
```

Non-optional `.min(1)` means `env.ts` aborts at boot if any is missing — that *is* the credential guard, so `cloudinary.ts` can read them unconditionally.

---

### 4.3 `src/config/cloudinary.ts` — **CREATE**

```ts
import { v2 as cloudinary } from 'cloudinary';
import { env } from './env';

// Configures the Cloudinary SDK singleton at first import.
// Credentials are guaranteed present: env.ts validates them as boot-required
// and exits the process if any is missing (mirrors payos.client.ts).
cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
  secure: true,
});

export { cloudinary };
```

---

### 4.4 `src/middlewares/upload.middleware.ts` — **CREATE**

```ts
import multer from 'multer';
import type { Request, Response, NextFunction } from 'express';
import { ApiError } from '../lib/api-error';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(new ApiError(400, 'INVALID_FILE_TYPE', 'Only JPEG, PNG, and WebP images are allowed'));
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
```

---

### 4.5 `src/services/users.service.ts` — **ADD METHOD**

Ensure these imports exist at the top of the file:

```ts
import { eq } from 'drizzle-orm';
import { db } from '../config/db';
import { users } from '../models';
import { cloudinary } from '../config/cloudinary';
import { ApiError } from '../lib/api-error';
```

New method (export it the same way the file's other service functions are exported):

```ts
/**
 * Uploads an avatar to Cloudinary (overwriting the user's existing one via a
 * stable public_id), persists the resulting URL, and returns it.
 */
export async function uploadAvatar(userId: string, file: Express.Multer.File): Promise<string> {
  let secureUrl: string;

  try {
    secureUrl = await new Promise<string>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'nutricoach/avatars',
          public_id: `avatar_${userId}`,
          overwrite: true,
          resource_type: 'image',
          transformation: [
            {
              width: 400,
              height: 400,
              crop: 'fill',
              gravity: 'face',
              quality: 'auto',
              fetch_format: 'auto',
            },
          ],
        },
        (error, result) => {
          if (error || !result) {
            reject(error ?? new Error('Empty Cloudinary response'));
            return;
          }
          resolve(result.secure_url);
        },
      );
      stream.end(file.buffer);
    });
  } catch {
    throw new ApiError(500, 'UPLOAD_FAILED', 'Failed to upload avatar image');
  }

  await db
    .update(users)
    .set({ avatarUrl: secureUrl, updatedAt: new Date() })
    .where(eq(users.id, userId));

  return secureUrl;
}
```

Drop `updatedAt: new Date()` if `users.updatedAt` already has a Drizzle `$onUpdate` or a DB trigger — harmless either way; confirm in `user.model.ts`.

---

### 4.6 `src/controllers/users.controller.ts` — **ADD HANDLER**

Ensure these imports exist:

```ts
import multer from 'multer';
import { ApiError } from '../lib/api-error';
// usersService + the local sendSuccess/handleError helpers already exist in this file.
```

New handler (uses this file's existing helpers; adjust `usersService.uploadAvatar` to match the file's actual service-import style):

```ts
export async function uploadAvatar(req: Request, res: Response) {
  try {
    if (!req.user) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Authentication required');
    }

    // The upload middleware stashes any multer error here instead of forwarding
    // it (no global error handler). Convert it before inspecting req.file.
    const uploadError = (req as Request & { uploadError?: unknown }).uploadError;
    if (uploadError) {
      if (uploadError instanceof multer.MulterError && uploadError.code === 'LIMIT_FILE_SIZE') {
        throw new ApiError(400, 'FILE_TOO_LARGE', 'Avatar must be 5 MB or smaller');
      }
      throw uploadError; // ApiError (INVALID_FILE_TYPE) or an unexpected error
    }

    if (!req.file) {
      throw new ApiError(400, 'NO_FILE_PROVIDED', 'No avatar file provided in field "avatar"');
    }

    const avatarUrl = await usersService.uploadAvatar(req.user.id, req.file);
    return sendSuccess(res, 200, { avatarUrl });
  } catch (err) {
    return handleError(res, err);
  }
}
```

`handleError` maps the thrown `ApiError` straight to its `status`/`code`/`message`, and anything unexpected to `500 INTERNAL_ERROR` — consistent with every other handler.

---

### 4.7 `src/routes/users.routes.ts` — **ADD ROUTE**

Ensure import:

```ts
import { uploadSingle } from '../middlewares/upload.middleware';
// authenticate and usersController.* are already imported in this file.
```

Register alongside the other `/me` routes:

```ts
router.post('/me/avatar', authenticate, uploadSingle('avatar'), usersController.uploadAvatar);
```

Order matters: `authenticate` → `uploadSingle('avatar')` → handler. Auth fails before any file parsing.

---

### 4.8 Swagger JSDoc — place directly above the route in 4.7

```ts
/**
 * @swagger
 * /api/v1/users/me/avatar:
 *   post:
 *     tags: [Users]
 *     summary: Upload or replace the current user's avatar
 *     description: >
 *       Uploads an avatar image (JPEG, PNG, or WebP, max 5 MB) to Cloudinary,
 *       overwriting any existing avatar, and returns the stored URL.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [avatar]
 *             properties:
 *               avatar:
 *                 type: string
 *                 format: binary
 *                 description: Image file (image/jpeg, image/png, image/webp)
 *     responses:
 *       200:
 *         description: Avatar uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     avatarUrl:
 *                       type: string
 *                       example: https://res.cloudinary.com/<cloud>/image/upload/v1/nutricoach/avatars/avatar_<uuid>.jpg
 *       400:
 *         description: INVALID_FILE_TYPE | FILE_TOO_LARGE | NO_FILE_PROVIDED
 *       401:
 *         description: UNAUTHORIZED | INVALID_TOKEN | ACCOUNT_DELETED
 *       500:
 *         description: UPLOAD_FAILED | INTERNAL_ERROR
 */
```

`CODEBASE_CONTEXT.md` flags `src/config/swagger.ts` as untracked/unimported while `API_CURRENT.md` says `/api-docs` is live — this JSDoc is harmless either way, but won't render until Swagger is actually wired.

---

## 5. Acceptance criteria — curl smoke tests

Set up once. Use a **real** small JPEG for the valid case (Cloudinary decodes it):

```bash
BASE=http://192.168.1.13:3000
TOKEN=<paste a valid accessToken>
# real JPEG for the happy path:
cp /path/to/real/photo.jpg ./photo.jpg
# 6 MB oversized file (random bytes, declared as jpeg — size limit trips before Cloudinary):
head -c 6291456 /dev/urandom > big.jpg
```

**① Valid JPEG → `200`, `avatarUrl` contains `res.cloudinary.com`**

```bash
curl -s -X POST "$BASE/api/v1/users/me/avatar" \
  -H "Authorization: Bearer $TOKEN" \
  -F "avatar=@photo.jpg;type=image/jpeg"
```
Expect:
```json
{"success":true,"data":{"avatarUrl":"https://res.cloudinary.com/.../nutricoach/avatars/avatar_<uuid>.jpg"}}
```

**② File > 5 MB → `400 FILE_TOO_LARGE`**

```bash
curl -s -X POST "$BASE/api/v1/users/me/avatar" \
  -H "Authorization: Bearer $TOKEN" \
  -F "avatar=@big.jpg;type=image/jpeg"
```
Expect: `{"success":false,"error":{"code":"FILE_TOO_LARGE",...}}`

**③ No file → `400 NO_FILE_PROVIDED`** (omit the field entirely)

```bash
curl -s -X POST "$BASE/api/v1/users/me/avatar" \
  -H "Authorization: Bearer $TOKEN"
```
Expect: `{"success":false,"error":{"code":"NO_FILE_PROVIDED",...}}`

**④ No auth token → `401 UNAUTHORIZED`**

```bash
curl -s -X POST "$BASE/api/v1/users/me/avatar" \
  -F "avatar=@photo.jpg;type=image/jpeg"
```
Expect: `{"success":false,"error":{"code":"UNAUTHORIZED",...}}`

**Bonus (covers the remaining 400 branch) — wrong MIME → `400 INVALID_FILE_TYPE`**

```bash
echo "not an image" > note.txt
curl -s -X POST "$BASE/api/v1/users/me/avatar" \
  -H "Authorization: Bearer $TOKEN" \
  -F "avatar=@note.txt;type=text/plain"
```
Expect: `{"success":false,"error":{"code":"INVALID_FILE_TYPE",...}}`

Re-running ① a second time must return the **same** `avatarUrl` (overwrite by `public_id`, no orphaned asset).

---

## 6. Constraints & gotchas

- **Drizzle ORM only — no raw SQL.** The DB write is a single `db.update(users).set(...).where(eq(...))`. No `pg.Pool.query()`.
- **No migration** — `users.avatar_url` exists since `0000`.
- **Singleton must hold at boot** — handled by env's boot-required validation; do not add a redundant runtime guard in `cloudinary.ts`.
- multer's `LIMIT_FILE_SIZE` is a `MulterError`, **not** an `ApiError` — it's converted in the controller, per 4.6.
- `req.file` is `undefined` when the client omits the field — explicit guard in 4.6.
- **Known edge (optional hardening, not required):** a file sent under the wrong field name raises `LIMIT_UNEXPECTED_FILE`, which currently falls through to `500 INTERNAL_ERROR`. Map it to `400` in the same `if (uploadError ...)` block if you want a cleaner 4xx; not part of the acceptance set.

Two things to verify against the real source before applying: the service-import style in `users.controller.ts` (`usersService.*` vs named import), and the `updatedAt` handling in `user.model.ts`.