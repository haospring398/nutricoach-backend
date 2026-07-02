# NutriCoach Backend — Implemented API

Snapshot of endpoints that actually exist in the route files. Anything not listed here is unimplemented.

> **Last updated:** 2026-06-18 · **Source of truth (always current):** Swagger `/api-docs` (raw spec `/api-docs.json`). This file is the narrative companion — when they disagree, trust Swagger. The Base URL under Conventions is a dev/LAN address; replace it with your environment's host.

## Conventions

- **Base URL:** `http://192.168.1.13:3000`
- **API prefix:** all endpoints live under `/api/v1` (except `/health`)
- **Auth header (when required):** `Authorization: Bearer <accessToken>`
- **Content-Type:** `application/json` for all request/response bodies
- **Response envelope:**
  - Success: `{ "success": true, "data": <payload> }`
  - Paginated success (list endpoints): `{ "success": true, "data": [...], "pagination": { "page", "limit", "totalItems", "totalPages", "hasNext", "hasPrev" } }`
  - PayOS webhook is the one exception — see its entry.
  - Error:   `{ "success": false, "error": { "code": "STRING_CODE", "message": "Human readable" } }`
  - `204 No Content` responses have no body.
- **Authenticated routes** can additionally return these errors from the auth middleware (in addition to anything listed per-endpoint). The middleware fetches the user row on every request to enforce soft-delete:
  - `401 UNAUTHORIZED` — missing/invalid `Authorization` header or empty Bearer value
  - `401 INVALID_TOKEN` — token failed JWT verify **or** referenced user row no longer exists
  - `401 ACCOUNT_DELETED` — user's `deleted_at` is not null
  - `401 ACCOUNT_BANNED` — user's `is_banned` is true; the `message` includes the ban reason (Vietnamese). Also returned by `POST /auth/login` for a banned account. Clients should force-logout on this code.
  - `500 INTERNAL_ERROR` — DB lookup for the user failed
- **Any endpoint with a Zod schema** can return `400 VALIDATION_ERROR` if validation fails; the `message` is the first failing rule.
- **Unhandled errors** in any controller return `500 INTERNAL_ERROR`.
- **File uploads** (avatar, course thumbnail, lesson video, admin article image) all share one `multipart/form-data` contract and the same client-error codes:
  - Images: `image/jpeg`, `image/png`, `image/webp`, ≤ 5 MB. Video (lesson only): `video/mp4`, ≤ 100 MB.
  - **Anti-spoof:** the server checks the file's leading bytes (magic number) against the declared `Content-Type`. A correctly-whitelisted `Content-Type` carrying a mismatched body is still rejected as `400 INVALID_FILE_TYPE`. So `INVALID_FILE_TYPE` means *either* a non-whitelisted type *or* a body that doesn't match its declared type.
  - `400 NO_FILE_PROVIDED` (no file part) · `400 EMPTY_FILE` (zero-byte file) · `400 FILE_TOO_LARGE` (over the cap) · `400 INVALID_FIELD_NAME` (file sent under the wrong field name) · `500 UPLOAD_FAILED` (Cloudinary error).

## Implementation status

- Implemented (by logical module): **Auth (10), Users (9), Nutrition (7), Foods (3), Dashboard (1), Payment (5), Workout (7), PT (22), Admin/PT-review (7), Admin user-mgmt (6), Content (14 — 2 PT-course + 12 articles), Quests (18 — 7 user + 11 admin), Scan (1)** — **110 endpoints total** (+ `GET /health`)

> **Count note:** exact `router.METHOD(...)` counts, verified against `docs/CODEBASE_CONTEXT.md §3`. The `/admin` mount physically carries 33 handlers spanning four logical modules (PT review 7 + article read/write 9 incl. `upload-image` + `:id/restore` + quest admin 11 incl. 3 redemption + 4 rewards CRUD + user management 6 incl. analytics); the table above groups by logical module. PT is **22** (P1 4, P2 courses 11 incl. thumbnail + lesson video upload + archived→draft restore, P3 students 4, P4 earnings/withdrawals 3); Auth is **10** incl. `GET /auth/me`.

> **Content/articles endpoints** (migration 0013) are now documented per-endpoint in this file (Content section for the public reads, Admin section for the article/category writes), in addition to Swagger (`/api-docs`).

---

## Health

### GET /health

- Auth: not required
- Request: none
- Response: `200 OK` — bare object, **no envelope**
  ```json
  {
    "status": "ok",
    "environment": "development",
    "timestamp": "2026-05-19T10:30:00.000Z"
  }
  ```
- Errors: none

---

## Auth — `/api/v1/auth`

### POST /api/v1/auth/register

- Auth: not required
- Request: body
  - `fullName`: string, trim, 2–100 chars
  - `email`: string, trim, lowercased, valid email
  - `password`: string, min 8 chars, ≥1 uppercase, ≥1 digit
- Side effect: server generates an email-verification token (24h TTL in Redis under `email_verify:<token>`) and fires a verification email via Resend. Both are non-blocking — registration succeeds even if Redis or Resend are down.
- Response: `201 Created`
  ```json
  {
    "success": true,
    "data": {
      "user": {
        "id": "uuid",
        "fullName": "Nguyen Van A",
        "email": "a@example.com",
        "role": "USER",
        "tier": "FREE",
        "createdAt": "2026-05-19T10:30:00.000Z"
      },
      "accessToken": "<jwt>",
      "refreshToken": "<jwt>"
    }
  }
  ```
- Errors:
  - `400 VALIDATION_ERROR`
  - `409 EMAIL_EXISTS`
  - `500 INTERNAL_ERROR`

---

### POST /api/v1/auth/login

- Auth: not required
- Request: body
  - `email`: string, trim, lowercased, valid email
  - `password`: string, min 1 char
- Response: `200 OK`
  ```json
  {
    "success": true,
    "data": {
      "user": {
        "id": "uuid",
        "fullName": "Nguyen Van A",
        "email": "a@example.com",
        "role": "USER",
        "tier": "FREE"
      },
      "accessToken": "<jwt>",
      "refreshToken": "<jwt>"
    }
  }
  ```
- Errors:
  - `400 VALIDATION_ERROR`
  - `401 INVALID_CREDENTIALS`
  - `500 INTERNAL_ERROR`

---

### POST /api/v1/auth/refresh

- Auth: not required (the refresh token in the body is the credential)
- Request: body
  - `refreshToken`: string, min 1 char
- Response: `200 OK` — the old refresh token is invalidated; clients must store the new one
  ```json
  {
    "success": true,
    "data": {
      "accessToken": "<jwt>",
      "refreshToken": "<jwt>"
    }
  }
  ```
- Errors:
  - `400 VALIDATION_ERROR`
  - `401 INVALID_TOKEN` — refresh token failed JWT verify, not found in DB, or user gone
  - `401 TOKEN_EXPIRED` — stored refresh token past its `expires_at`
  - `500 INTERNAL_ERROR`

---

### POST /api/v1/auth/logout

- Auth: required
- Request: body
  - `refreshToken`: string, min 1 char
- Behavior: deletes the row from `refresh_tokens` only if `(token, userId)` matches the caller.
- Response: `200 OK`
  ```json
  { "success": true, "data": { "message": "Logged out" } }
  ```
- Errors:
  - `400 VALIDATION_ERROR`
  - `401 UNAUTHORIZED` — defensive `req.user` check after middleware
  - `500 INTERNAL_ERROR`

---

### POST /api/v1/auth/logout-all

- Auth: required
- Request: no body
- Behavior: deletes every row in `refresh_tokens` for the caller. Existing access tokens still work until they expire.
- Response: `204 No Content`
- Errors:
  - `401 UNAUTHORIZED` — defensive `req.user` check after middleware
  - `500 INTERNAL_ERROR`

---

### GET /api/v1/auth/me

> **Both `GET /auth/me` and `GET /users/me` return the current user. Mobile team should use [`GET /users/me`](#get-apiv1usersme) as the canonical endpoint — it includes `metrics` and onboarding status; this one returns only the bare user identity (no metrics).**

- Auth: required
- Request: none
- Response: `200 OK`
  ```json
  {
    "success": true,
    "data": {
      "user": {
        "id": "uuid",
        "fullName": "Nguyen Van A",
        "email": "a@example.com",
        "role": "USER",
        "emailVerified": false,
        "tier": "FREE",
        "onboardingCompleted": false,
        "createdAt": "2026-05-19T10:30:00.000Z"
      }
    }
  }
  ```
- Errors:
  - `401 UNAUTHORIZED` — defensive `req.user` check
  - `401 USER_NOT_FOUND` — service-level fallback if the user row vanishes between middleware and service (practically unreachable)
  - `500 INTERNAL_ERROR`

---

### POST /api/v1/auth/verify-email

- Auth: not required
- Request: body
  - `token`: string, min 1 char — the `evt_…` value from the verification email URL
- Behavior: looks up `email_verify:<token>` in Redis, sets `users.email_verified = true`, deletes the token. Idempotent — if the user is already verified, returns success and still deletes the token.
- Response: `200 OK`
  ```json
  { "success": true, "data": { "emailVerified": true } }
  ```
- Errors:
  - `400 VALIDATION_ERROR`
  - `400 INVALID_VERIFICATION_TOKEN` — token not found in Redis (never issued, expired, already consumed) or the token's userId no longer exists
  - `500 INTERNAL_ERROR`

---

### POST /api/v1/auth/resend-verification

- Auth: required
- Request: no body
- Behavior: generates a new `evt_…` token (24h TTL), stores it in Redis, fires a verification email. No rate limiting is enforced in code yet — a `TODO` comment lives in `auth.service.ts`.
- Response: `200 OK`
  ```json
  { "success": true, "data": { "message": "Verification email sent" } }
  ```
- Errors:
  - `400 ALREADY_VERIFIED` — `users.email_verified` is already true
  - `401 UNAUTHORIZED` — defensive `req.user` check
  - `401 USER_NOT_FOUND` — service-level fallback (practically unreachable after middleware)
  - `500 INTERNAL_ERROR`

---

### POST /api/v1/auth/forgot-password

- Auth: not required
- Request: body
  - `email`: string, trim, lowercased, valid email
- Behavior: enumeration-safe — always returns the same 200 message regardless of whether the email exists or the user is soft-deleted. If the user is found and not deleted, a `prt_…` reset token (15-minute TTL under `pwd_reset:<token>`) is created and a reset email is fired.
- Response: `200 OK`
  ```json
  {
    "success": true,
    "data": { "message": "Nếu email tồn tại, link đặt lại mật khẩu đã được gửi" }
  }
  ```
- Errors:
  - `400 VALIDATION_ERROR`
  - `500 INTERNAL_ERROR`

---

### POST /api/v1/auth/reset-password

- Auth: not required
- Request: body
  - `token`: string, min 1 char — the `prt_…` value from the reset email URL
  - `newPassword`: string, min 8 chars, ≥1 uppercase, ≥1 digit
- Behavior: verifies the token in Redis, bcrypt-hashes the new password (cost 12), updates `users.password`, deletes the token, and **revokes every refresh token for the user** — they must log in again everywhere.
- Response: `200 OK`
  ```json
  {
    "success": true,
    "data": { "message": "Mật khẩu đã được đặt lại thành công" }
  }
  ```
- Errors:
  - `400 VALIDATION_ERROR`
  - `400 INVALID_RESET_TOKEN` — token not found in Redis or the token's userId no longer exists
  - `500 INTERNAL_ERROR`

---

## Users — `/api/v1/users`

All endpoints require auth.

### GET /api/v1/users/me

> **Canonical "who am I" endpoint.** Both `GET /users/me` and [`GET /auth/me`](#get-apiv1authme) return user info; Mobile team should prefer **this one** — it includes `metrics` (BMR/TDEE/daily targets) and onboarding status, which `GET /auth/me` omits.

- Auth: required
- Request: none
- Response: `200 OK`
  ```json
  {
    "success": true,
    "data": {
      "id": "uuid",
      "email": "a@example.com",
      "fullName": "Nguyen Van A",
      "avatarUrl": null,
      "phone": null,
      "role": "USER",
      "tier": "FREE",
      "emailVerified": false,
      "onboardingCompleted": true,
      "metrics": {
        "gender": "MALE",
        "dateOfBirth": "1998-03-15",
        "heightCm": 175,
        "weightKg": 72.5,
        "activityLevel": "MODERATE",
        "goal": "LOSE_WEIGHT",
        "targetWeightKg": 68,
        "bmr": 1693,
        "tdee": 2624,
        "dailyCalorieTarget": 2124,
        "macros": { "proteinG": 159, "carbsG": 212, "fatG": 71 }
      },
      "createdAt": "2026-05-19T10:30:00.000Z"
    }
  }
  ```
  - `metrics` is `null` if the user has not completed onboarding.
- Errors:
  - `404 USER_NOT_FOUND`
  - `500 INTERNAL_ERROR`

---

### PATCH /api/v1/users/me

- Auth: required
- Request: body (all optional, unknown keys rejected by `.strict()`)
  - `fullName`: string, trim, 2–100 chars
  - `phone`: string, trim, regex `^\+84[0-9]{9}$`
  - `avatarUrl`: string, trim, valid URL
  - `preferredLanguage`: enum `"vi" | "en"`
- Response: `200 OK` — same shape as `GET /users/me`
- Errors:
  - `400 VALIDATION_ERROR`
  - `404 USER_NOT_FOUND` — update affected no rows
  - `500 INTERNAL_ERROR`

---

### POST /api/v1/users/me/onboarding

- Auth: required
- Request: body
  - `gender`: enum `"MALE" | "FEMALE"`
  - `dateOfBirth`: string `YYYY-MM-DD`, computed age in `[13, 100]`
  - `heightCm`: integer, 100–250
  - `weightKg`: number, 30–300
  - `activityLevel`: enum `"SEDENTARY" | "LIGHT" | "MODERATE" | "ACTIVE" | "VERY_ACTIVE"`
  - `goal`: enum `"LOSE_WEIGHT" | "MAINTAIN" | "GAIN_WEIGHT" | "GAIN_MUSCLE"`
  - `targetWeightKg` (optional): number, 30–300
  - `dietaryRestrictions` (optional): string[], each item trim, min 1 char
  - `allergies` (optional): string[], each item trim, min 1 char
- Behavior: computes BMR / TDEE / daily-calorie target / macros (Mifflin-St Jeor) and upserts the `user_metrics` row. Also sets `users.onboarding_completed = true`.
- Response: `200 OK`
  ```json
  {
    "success": true,
    "data": {
      "bmr": 1693,
      "tdee": 2624,
      "dailyCalorieTarget": 2124,
      "macros": { "proteinG": 159, "carbsG": 212, "fatG": 71 },
      "onboardingCompleted": true
    }
  }
  ```
- Errors:
  - `400 VALIDATION_ERROR`
  - `500 INTERNAL_ERROR`

---

### GET /api/v1/users/me/metrics

- Auth: required
- Request: none
- Response: `200 OK`
  ```json
  {
    "success": true,
    "data": {
      "bmi": 23.7,
      "bmiCategory": "NORMAL",
      "bmr": 1693,
      "tdee": 2624,
      "dailyCalorieTarget": 2124,
      "macros": { "proteinG": 159, "carbsG": 212, "fatG": 71 }
    }
  }
  ```
  `bmiCategory` thresholds: `< 18.5 → "UNDERWEIGHT"`, `< 25 → "NORMAL"`, `< 30 → "OVERWEIGHT"`, otherwise `"OBESE"`.
- Errors:
  - `404 USER_METRICS_NOT_FOUND` — onboarding not completed
  - `500 INTERNAL_ERROR`

---

### POST /api/v1/users/me/avatar

- Auth: required
- Request: `multipart/form-data` with a single file field `avatar`
  - Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`
  - Max size: 5 MB
- Behavior: uploads to Cloudinary (folder `nutricoach/avatars`) with `public_id = avatar_${userId}` and `overwrite: true`, persists the resulting URL on `users.avatar_url`, and returns it. Re-uploading replaces the asset in place — the **same** URL is returned (stable URL, no orphaned assets).
- Response: `200 OK`
  ```json
  {
    "success": true,
    "data": {
      "avatarUrl": "https://res.cloudinary.com/<cloud>/image/upload/v1/nutricoach/avatars/avatar_<uuid>.jpg"
    }
  }
  ```
- Errors:
  - `400 NO_FILE_PROVIDED` — no file in the `avatar` field
  - `400 EMPTY_FILE` — the uploaded file is zero bytes
  - `400 INVALID_FILE_TYPE` — declared MIME type not in the whitelist, **or the file's leading bytes don't match the declared `Content-Type`** (a spoofed `Content-Type` is rejected)
  - `400 FILE_TOO_LARGE` — file exceeds 5 MB
  - `400 INVALID_FIELD_NAME` — file sent under a field other than `avatar`
  - `500 UPLOAD_FAILED` — Cloudinary upload failed

---

### PATCH /api/v1/users/me/metrics

Post-onboarding update of body metrics. Merges the provided fields over the existing row and **re-computes all derived fields** (BMR, TDEE, daily calorie target, macros, BMI) on every call.

- Auth: required
- Request: body (unknown keys rejected by `.strict()`; at least one field required)
  - `weightKg` (optional): number, 30–300
  - `heightCm` (optional): integer, 100–250
  - `activityLevel` (optional): enum `"SEDENTARY" | "LIGHT" | "MODERATE" | "ACTIVE" | "VERY_ACTIVE"`
  - `goal` (optional): enum `"LOSE_WEIGHT" | "MAINTAIN" | "GAIN_WEIGHT" | "GAIN_MUSCLE"`
  - `targetWeightKg` (optional): number, 30–300
  - `dietaryRestrictions` (optional): string[] (each trimmed, non-empty)
  - `allergies` (optional): string[] (each trimmed, non-empty)
  - `gender` and `dateOfBirth` are **immutable** post-onboarding and rejected by `.strict()`.
- Response: `200 OK`
  ```json
  {
    "success": true,
    "data": {
      "weightKg": 70,
      "heightCm": 175,
      "activityLevel": "ACTIVE",
      "goal": "GAIN_MUSCLE",
      "targetWeightKg": 72,
      "dietaryRestrictions": [],
      "allergies": [],
      "bmi": 22.9,
      "bmiCategory": "NORMAL",
      "bmr": 1649,
      "tdee": 2845,
      "dailyCalorieTarget": 3145,
      "macros": { "proteinG": 236, "carbsG": 315, "fatG": 105 },
      "updatedAt": "2026-06-04T10:30:00.000Z"
    }
  }
  ```
  `weightKg`/`targetWeightKg` are returned as numbers (the `numeric` columns are coerced). `bmi`/`bmiCategory` are computed for the response only (not stored). `bmiCategory` thresholds match `GET /users/me/metrics`.
- Errors:
  - `400 VALIDATION_ERROR` — empty body, unknown key, or a value out of range
  - `404 USER_METRICS_NOT_FOUND` — onboarding not completed
  - `500 INTERNAL_ERROR`

---

### POST /api/v1/users/me/change-password

- Auth: required
- Request: body (unknown keys rejected by `.strict()`)
  - `currentPassword`: string, min 1 char
  - `newPassword`: string, min 8 chars, ≥1 uppercase, ≥1 digit
  - `refreshToken` (optional): string, min 1 char — if provided, every refresh token for the user *except* that one is revoked; otherwise all are revoked
- Response: `204 No Content`
- Errors:
  - `400 VALIDATION_ERROR`
  - `401 INVALID_CURRENT_PASSWORD`
  - `404 USER_NOT_FOUND`
  - `500 INTERNAL_ERROR`

---

### DELETE /api/v1/users/me

- Auth: required
- Request: body (unknown keys rejected by `.strict()`)
  - `password`: string, min 1 char
  - `reason` (optional): string, trim, max 500 chars
- Behavior: soft delete — sets `users.deleted_at = now()` and deletes every refresh token for the user. The auth middleware then rejects any subsequent request with `401 ACCOUNT_DELETED`, so previously-issued access tokens are effectively dead.
- Response: `204 No Content`
- Errors:
  - `400 VALIDATION_ERROR`
  - `401 INVALID_PASSWORD`
  - `404 USER_NOT_FOUND`
  - `500 INTERNAL_ERROR`

---

### GET /api/v1/users/me/pt-assignments

Student-facing feed of meal-plan and exercise assignments from PT(s) the user is enrolled with. Superseded meal-plan versions are filtered out; only the current active row per type is returned.

- Auth: required
- Request: query
  - `type` (optional): enum `"MEAL_PLAN" | "EXERCISE_ADDITION"`
  - `page` (optional): integer ≥1, default `1`
  - `limit` (optional): integer 1–50, default `20`
- Response: `200 OK` — paginated envelope
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "uuid",
        "type": "MEAL_PLAN",
        "payload": { "days": [ /* PT-submitted shape */ ] },
        "scheduledFor": null,
        "note": "Giảm carbs sau 18h",
        "createdAt": "2026-05-13T14:00:00.000Z",
        "from": {
          "ptId": "uuid",
          "fullName": "Trần Văn B",
          "avatarUrl": null
        }
      }
    ],
    "pagination": { "page": 1, "limit": 20, "totalItems": 3, "totalPages": 1, "hasNext": false, "hasPrev": false }
  }
  ```
- Errors:
  - `400 VALIDATION_ERROR`
  - `500 INTERNAL_ERROR`

---

## Nutrition — `/api/v1/nutrition`

All endpoints require auth.

### POST /api/v1/nutrition/food-logs

Discriminated union — **exactly one** of Mode A or Mode B. Both modes share `mealType` and `consumedAt`; both reject unknown keys via `.strict()`.

**Shared required fields**

- `mealType`: enum `"BREAKFAST" | "LUNCH" | "DINNER" | "SNACK"`
- `consumedAt`: ISO 8601 datetime with offset, **must not be more than 5 minutes in the future** (clock-drift guard)

**Mode A — from catalog**

Server looks up `food_items.id`, snapshots macros, and computes calories/portion at write time. Stored macros may be `null` if the catalog item has `dataCompleteness != "FULL"`, but the response always returns macros as numbers (null is coerced to 0 at the API boundary).

- `foodItemId`: UUID
- `portionGrams`: integer, 1–5000

**Mode B — custom**

Caller supplies all macros and a multiplier; server stores values as-is.

- `customName`: string, trim, 1–200 chars
- `calories`: integer, 0–10000
- `macros`: object
  - `proteinG`: number, 0–500
  - `carbsG`: number, 0–2000
  - `fatG`: number, 0–500
- `portion`: number, 0.25–10 (multiplier — not grams)

- Auth: required
- Response: `201 Created`
  ```json
  {
    "success": true,
    "data": {
      "foodLogId": "uuid",
      "foodItemId": "uuid-or-null",
      "foodName": "Phở bò",
      "calories": 520,
      "macros": { "proteinG": 32, "carbsG": 68, "fatG": 12 },
      "portion": 2.5,
      "mealType": "LUNCH",
      "consumedAt": "2026-05-19T12:30:00.000Z"
    }
  }
  ```
- Errors:
  - `400 VALIDATION_ERROR` — fails `.union()` parse (missing fields, both modes provided, or extra keys)
  - `404 FOOD_ITEM_NOT_FOUND` — Mode A `foodItemId` does not exist
  - `500 INTERNAL_ERROR`

---

### GET /api/v1/nutrition/food-logs?date=YYYY-MM-DD

- Auth: required
- Request: query
  - `date`: string, required, regex `^\d{4}-\d{2}-\d{2}$`
- Behavior: filters rows where `consumed_at::date = :date::date` and `user_id = caller`, ordered by `consumed_at` ascending.
- Response: `200 OK`
  ```json
  {
    "success": true,
    "data": {
      "date": "2026-05-19",
      "meals": {
        "breakfast": [
          {
            "id": "uuid",
            "foodItemId": "uuid-or-null",
            "foodName": "Bánh mì",
            "calories": 420,
            "macros": { "proteinG": 18, "carbsG": 55, "fatG": 15 },
            "portion": 1,
            "mealType": "BREAKFAST",
            "consumedAt": "2026-05-19T07:30:00.000Z"
          }
        ],
        "lunch": [],
        "dinner": [],
        "snack": []
      },
      "totals": { "calories": 420, "proteinG": 18, "carbsG": 55, "fatG": 15 }
    }
  }
  ```
- Errors:
  - `400 VALIDATION_ERROR` — missing or malformed `date`
  - `500 INTERNAL_ERROR`

---

### PATCH /api/v1/nutrition/food-logs/:id

- Auth: required
- Request:
  - path: `id` — UUID
  - body (at least one field required, unknown keys rejected by `.strict()`)
    - `foodName`: string, trim, 1–200 chars
    - `calories`: integer, 0–10000
    - `proteinG`: number, 0–500
    - `carbsG`: number, 0–500
    - `fatG`: number, 0–500
    - `portion`: number, 0.25–10
    - `mealType`: enum `"BREAKFAST" | "LUNCH" | "DINNER" | "SNACK"`
    - `consumedAt`: ISO 8601 datetime with offset
- Behavior: update is filtered by `id = :id AND user_id = caller`, so non-owners get 404 (not 403).
- Response: `200 OK` — same shape as `POST /food-logs` response
- Errors:
  - `400 VALIDATION_ERROR` — path or body fails Zod, including empty-body refinement
  - `404 FOOD_LOG_NOT_FOUND`
  - `500 INTERNAL_ERROR`

---

### DELETE /api/v1/nutrition/food-logs/:id

- Auth: required
- Request:
  - path: `id` — UUID
- Behavior: deletes only if `id = :id AND user_id = caller`.
- Response: `204 No Content`
- Errors:
  - `400 VALIDATION_ERROR` — `id` is not a UUID
  - `404 FOOD_LOG_NOT_FOUND`
  - `500 INTERNAL_ERROR`

---

### GET /api/v1/nutrition/summary/daily?date=YYYY-MM-DD

- Auth: required
- Request: query
  - `date`: string, required, regex `^\d{4}-\d{2}-\d{2}$`
- Behavior: aggregates the caller's food logs for the given day and compares against the targets stored in `user_metrics`.
- Response: `200 OK`
  ```json
  {
    "success": true,
    "data": {
      "date": "2026-05-19",
      "target": {
        "calories": 2124,
        "proteinG": 159,
        "carbsG": 212,
        "fatG": 71
      },
      "consumed": {
        "calories": 1450,
        "proteinG": 95,
        "carbsG": 145,
        "fatG": 48
      },
      "remaining": {
        "calories": 674,
        "proteinG": 64,
        "carbsG": 67,
        "fatG": 23
      },
      "progressPercent": 68.3,
      "meals": {
        "breakfast": 420,
        "lunch": 670,
        "dinner": 0,
        "snack": 360
      }
    }
  }
  ```
  - When the user has not completed onboarding, `target`, `remaining`, and `progressPercent` are `null`. `consumed` and `meals` are always present (zeros if no logs).
  - `progressPercent` rounded to 1 decimal; macro sums rounded to 2 decimals.
- Errors:
  - `400 VALIDATION_ERROR` — missing or malformed `date`
  - `500 INTERNAL_ERROR`

---

### POST /api/v1/nutrition/meal-plans/generate

Generates an AI meal + exercise plan from the caller's stored metrics. **Synchronous** — the request blocks on the AI microservice and returns the plan inline. **Persisted**: the result is upserted into `meal_plans` (one row per user) so it can be re-read via `GET /nutrition/meal-plans`.

- Auth: required
- Request: no body required — the caller's `user_metrics` row (gender, DOB, height, weight, activity level, goal, target weight, daily calorie target, dietary restrictions, allergies, macro targets) plus `users.tier` are loaded server-side and forwarded to the AI service. `numeric` weights are coerced to numbers first.
- Behavior:
  - Maps the metrics to the AI service's `/plan` contract (`{ question, userInfo: { id, fullName, subscription: { plan }, metrics } }` — `subscription.plan` is derived from `users.tier`), calls it with the `X-AI-Secret` header.
  - Retries transient AI failures (HTTP 429/502/503/504 or network/parse errors) up to 3 attempts with a `2s, 4s` backoff.
  - Accepts either `{ plan: ... }` or a bare plan object (`plan ?? body`).
  - Injects a default whole-body `exercise_plan` (Squat 3×10–12, Push Up 3×8–10) when the AI omits one, so the mobile app always has a workout to render.
  - Upserts the plan into `meal_plans` (`ON CONFLICT (user_id) DO UPDATE`). A DB-write failure is reported as `500 INTERNAL_ERROR` — it is **never** collapsed into `AI_SERVICE_UNAVAILABLE`.
- Response: `200 OK`
  ```json
  {
    "success": true,
    "data": {
      "summary": "Kế hoạch 7 ngày ...",
      "calories_target": 2124,
      "daily_meals": [
        { "day": 1, "meals": [ { "name": "Bữa sáng", "items": ["..."], "calories": 530 } ], "calories_estimate": 1800 }
      ],
      "exercise_plan": [ { "day": 1, "session_name": "Toàn thân cơ bản", "exercises": ["..."] } ]
    }
  }
  ```
  The exact `data` shape is produced by the AI service and returned verbatim.
- Errors:
  - `401 UNAUTHORIZED`
  - `404 USER_METRICS_NOT_FOUND` — onboarding not completed
  - `503 AI_SERVICE_UNAVAILABLE` — AI microservice unreachable or returned a non-2xx after retries
  - `500 INTERNAL_ERROR` — plan generated but failed to persist

---

### GET /api/v1/nutrition/meal-plans

Returns the caller's most recently generated meal + exercise plan (the row persisted by `POST /nutrition/meal-plans/generate`).

- Auth: required
- Request: none
- Response: `200 OK` — `{ "success": true, "data": <the saved plan> }`. `data` is the exact plan object returned by `generate`.
- Errors:
  - `401 UNAUTHORIZED`
  - `404 MEAL_PLAN_NOT_FOUND` — the user has not generated a plan yet
  - `500 INTERNAL_ERROR`

---

## Foods — `/api/v1/foods`

All endpoints require auth.

### GET /api/v1/foods/search?q=...

- Auth: required
- Request: query
  - `q`: string, trim, 1–100 chars (required)
  - `type` (optional): enum `"INGREDIENT" | "DISH"`
  - `category` (optional): string, trim, 1–128 chars
  - `completeness` (optional): enum `"FULL" | "PARTIAL" | "CALORIES_ONLY"`
  - `page` (optional): integer ≥1, default `1` (coerced from string)
  - `limit` (optional): integer 1–50, default `20` (coerced from string)
- Behavior: matches rows where `pg_trgm` similarity on `name_vi` or `name_en` > 0.2 **or** either name `ILIKE '%q%'`. Ordered by `GREATEST(sim(name_vi), sim(name_en))` DESC, then `name_vi` ASC for stable pagination.
- Response: `200 OK` — paginated envelope (note `pagination` sits next to `data`)
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "uuid",
        "externalId": "HAP-223031",
        "type": "DISH",
        "nameVi": "Phở bò tái",
        "nameEn": "Beef pho with rare beef",
        "category": "Thick rice noodle, rice vermicelli, pho",
        "per100g": {
          "calories": 145,
          "proteinG": 8.2,
          "totalFatG": 3.1,
          "carbohydrateG": 22.4,
          "sugarG": null
        },
        "dataCompleteness": "FULL",
        "isVerified": true
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "totalItems": 47,
      "totalPages": 3,
      "hasNext": true,
      "hasPrev": false
    }
  }
  ```
- Errors:
  - `400 VALIDATION_ERROR`
  - `500 INTERNAL_ERROR`

---

### GET /api/v1/foods/categories

- Auth: required
- Request: query
  - `type` (optional): enum `"INGREDIENT" | "DISH"` — filter the grouping
- Behavior: groups by `(category, type)` and counts. Result is Redis-cached under `foods:categories:<type|"all">` with a 1-hour TTL.
- Response: `200 OK`
  ```json
  {
    "success": true,
    "data": [
      { "name": "Vegetables, fruits, tubers used as vegetables", "type": "INGREDIENT", "count": 169 },
      { "name": "Other food dishes", "type": "DISH", "count": 323 }
    ]
  }
  ```
- Errors:
  - `400 VALIDATION_ERROR`
  - `500 INTERNAL_ERROR`

---

### GET /api/v1/foods/:id

- Auth: required
- Request: path
  - `id`: UUID
- Response: `200 OK`
  ```json
  {
    "success": true,
    "data": {
      "id": "uuid",
      "externalId": "HAP-223031",
      "source": "VN_NIN",
      "type": "DISH",
      "nameVi": "Phở bò tái",
      "nameEn": "Beef pho with rare beef",
      "category": "Thick rice noodle, rice vermicelli, pho",
      "per100g": {
        "calories": 145,
        "proteinG": 8.2,
        "totalFatG": 3.1,
        "carbohydrateG": 22.4,
        "sugarG": null,
        "calciumMg": 28.5,
        "ironMg": 1.8,
        "sodiumMg": 412,
        "potassiumMg": 188,
        "vitaminCMg": null,
        "vitaminAIu": null,
        "micronutrients": {
          "zincMg": 1.2,
          "vitaminB1Mg": 0.04
        }
      },
      "dataCompleteness": "FULL",
      "isVerified": true,
      "createdAt": "2026-05-19T10:00:00.000Z"
    }
  }
  ```
  `per100g.micronutrients` is either an object of `<key>: number` (camelCase keys like `zincMg`, `vitaminB1Mg`, `saturatedFatG`, `tryptophanMg`) or `null`.
- Errors:
  - `400 VALIDATION_ERROR` — `id` is not a UUID
  - `404 FOOD_ITEM_NOT_FOUND`
  - `500 INTERNAL_ERROR`

---

## Dashboard — `/api/v1/dashboard`

### GET /api/v1/dashboard/user

- Auth: required
- Request: none
- Behavior: aggregates the caller's home-screen data for "today" in the `Asia/Ho_Chi_Minh` timezone.
- Response: `200 OK`
  ```json
  {
    "success": true,
    "data": {
      "date": "2026-05-21",
      "timezone": "Asia/Ho_Chi_Minh",
      "todayCalories": {
        "consumed": 1450,
        "target": 2124,
        "remaining": 674,
        "progressPercent": 68.3
      },
      "todayMacros": {
        "consumed": { "proteinG": 95.2, "carbsG": 145.5, "fatG": 48.3 },
        "target": { "proteinG": 159, "carbsG": 212, "fatG": 71 }
      },
      "mealsBreakdown": { "BREAKFAST": 420, "LUNCH": 670, "DINNER": 0, "SNACK": 360 },
      "streakDays": 12,
      "lastLoggedAt": "2026-05-21T13:45:00.000Z",
      "currentWeightKg": 72.5,
      "targetWeightKg": 68,
      "weightTrend7dKg": null,
      "goal": "LOSE_WEIGHT",
      "tier": "FREE",
      "onboardingCompleted": true,
      "upcomingMeals": [],
      "todayExercises": [],
      "weeklyWorkouts": null
    }
  }
  ```
  - When the user has not completed onboarding: `todayCalories.target`, `todayCalories.remaining`, `todayCalories.progressPercent`, `todayMacros.target`, `currentWeightKg`, `targetWeightKg`, and `goal` are `null`. `consumed`, `mealsBreakdown`, `streakDays`, `lastLoggedAt` still work.
  - `weightTrend7dKg` / `weeklyWorkouts` are always `null`, `upcomingMeals` / `todayExercises` always `[]` — stable placeholders for unbuilt features.
  - `streakDays` = consecutive VN calendar days with ≥1 food log, counting back from today (today excluded if not yet logged).
- Errors:
  - `404 USER_NOT_FOUND` — defensive fallback (practically unreachable after middleware)
  - `500 INTERNAL_ERROR`

---

## Payment — `/api/v1/payment`

PRO subscriptions and PT-course purchases via PayOS.

### POST /api/v1/payment/checkout

- Auth: required
- Request:
  - header `Idempotency-Key`: UUID (required) — a repeated key returns the first call's cached response
  - body (unknown keys rejected by `.strict()`)
    - `productType`: enum `"PRO_MONTHLY" | "PRO_YEARLY" | "PT_COURSE"`
    - `productId` (required iff `productType === "PT_COURSE"`): UUID of a published course
    - `returnUrl` (optional): valid URL — defaults to `nutricoach://payment/success`
    - `cancelUrl` (optional): valid URL — defaults to `nutricoach://payment/cancel`
- Behavior: creates a `pending` transaction and a PayOS payment link. For `PT_COURSE`, the price is looked up from the `courses` table (must be `PUBLISHED`) and the user must not already hold an active enrollment for that course. The response (including `qrCode`) is cached in Redis under the idempotency key for 24h.
- Response: **`201 Created`** on the first call, **`200 OK`** on an idempotent replay (identical body)
  ```json
  {
    "success": true,
    "data": {
      "transactionId": "uuid",
      "orderCode": 1779291633504042,
      "productType": "PT_COURSE",
      "amountVnd": 1490000,
      "status": "PENDING",
      "paymentLinkId": "abc123",
      "checkoutUrl": "https://pay.payos.vn/web/abc123",
      "qrCode": "00020101...",
      "expiresAt": "2026-05-21T12:00:00.000Z"
    }
  }
  ```
  PRO prices: `PRO_MONTHLY` = 99000 VND / 30 days, `PRO_YEARLY` = 899000 VND / 365 days. PT course prices come from `courses.price_vnd` (50,000–50,000,000 VND, multiples of 1,000).
- Errors:
  - `400 VALIDATION_ERROR` — missing/invalid `Idempotency-Key`, bad body, or missing `productId` for `PT_COURSE`
  - `404 COURSE_NOT_FOUND` — course doesn't exist or isn't published
  - `409 ALREADY_ENROLLED` — user already has an active enrollment for this course
  - `503 PAYOS_UNAVAILABLE` — PayOS call failed (transaction is marked `failed`)
  - `500 INTERNAL_ERROR`

---

### POST /api/v1/payment/webhook/payos

- Auth: **none** — security is the PayOS signature
- Request: body — the PayOS webhook envelope `{ code, desc, success, data, signature }`. The handler reads the raw request bytes (`req.rawBody`).
- Behavior: verifies the signature, then on a `PAID` event marks the transaction `paid` and, in the same DB transaction, branches by `productType`:
  - `pro_monthly` / `pro_yearly` — activates/extends the user's subscription and flips `users.tier` to `PRO`.
  - `pt_course` — inserts an `enrollments` row (idempotent on `transaction_id`) and a `pt_earnings` row capturing the PT's commission snapshot (`available_at = paid_at + 7 days`, `status = 'on_hold'`).

  Idempotent: a replay of an already-paid order is a no-op.
- Response: **always `200`** with `{ "received": true, "action": "..." }` once processed — `action` is one of `paid`, `already_paid`, `unknown_order`, `amount_mismatch`. A bad signature also returns `200 { "received": true }` (so PayOS does not retry a forged call). This endpoint does **not** use the standard envelope.
- Errors:
  - `400 INVALID_JSON` — request body is not parseable JSON
  - `500 WEBHOOK_PROCESSING_ERROR` — a genuine processing failure (returned so PayOS retries)

---

### GET /api/v1/payment/transactions

- Auth: required
- Request: query (unknown keys rejected by `.strict()`)
  - `page` (optional): integer ≥1, default `1`
  - `limit` (optional): integer 1–50, default `20`
  - `status` (optional): enum `"PENDING" | "PAID" | "FAILED" | "EXPIRED" | "CANCELLED"`
- Response: `200 OK` — paginated envelope
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "uuid",
        "orderCode": 1779291633504042,
        "productType": "PRO_MONTHLY",
        "amountVnd": 99000,
        "status": "PAID",
        "paymentLinkId": "abc123",
        "checkoutUrl": "https://pay.payos.vn/web/abc123",
        "reference": "FT2026...",
        "paidAt": "2026-05-21T12:05:00.000Z",
        "expiresAt": "2026-05-21T12:00:00.000Z",
        "createdAt": "2026-05-21T11:30:00.000Z"
      }
    ],
    "pagination": { "page": 1, "limit": 20, "totalItems": 3, "totalPages": 1, "hasNext": false, "hasPrev": false }
  }
  ```
- Errors:
  - `400 VALIDATION_ERROR`
  - `500 INTERNAL_ERROR`

---

### GET /api/v1/payment/subscription

- Auth: required
- Request: none
- Response: `200 OK`
  ```json
  {
    "success": true,
    "data": {
      "status": "ACTIVE",
      "plan": "PRO_YEARLY",
      "startedAt": "2026-01-10T00:00:00.000Z",
      "expiresAt": "2027-01-10T00:00:00.000Z",
      "autoRenew": false,
      "daysRemaining": 234
    }
  }
  ```
  - No active subscription: `{ "status": "NONE", "plan": null, "startedAt": null, "expiresAt": null, "autoRenew": false, "daysRemaining": 0 }`.
  - If the active row's `expiresAt` has passed, `status` is computed as `"EXPIRED"` and `daysRemaining` is `0` (the read endpoint never mutates the row).
- Errors:
  - `500 INTERNAL_ERROR`

---

### GET /api/v1/payment/courses

Student's purchased courses. Lists enrollments where `status != 'refunded'`.

- Auth: required
- Request: query
  - `page` (optional): integer ≥1, default `1`
  - `limit` (optional): integer 1–50, default `20`
- Response: `200 OK` — paginated envelope
  ```json
  {
    "success": true,
    "data": [
      {
        "enrollmentId": "uuid",
        "courseId": "uuid",
        "title": "Giảm 5kg trong 30 ngày",
        "thumbnailUrl": null,
        "ptId": "uuid",
        "ptFullName": "Trần Văn B",
        "status": "ACTIVE",
        "enrolledAt": "2026-04-01T00:00:00.000Z",
        "totalLessons": 12,
        "durationDays": 30
      }
    ],
    "pagination": { "page": 1, "limit": 20, "totalItems": 1, "totalPages": 1, "hasNext": false, "hasPrev": false }
  }
  ```
- Errors:
  - `400 VALIDATION_ERROR`
  - `500 INTERNAL_ERROR`

---

## Workout — `/api/v1/workout`

All endpoints require auth. The exercise library is read-only (seeded; no create/update/delete).

### GET /api/v1/workout/exercises

- Auth: required
- Request: query (unknown keys rejected by `.strict()`)
  - `muscleGroup` (optional): enum `CHEST | BACK | SHOULDERS | BICEPS | TRICEPS | LEGS | GLUTES | CORE | CARDIO | FULL_BODY`
  - `equipment` (optional): enum `BODYWEIGHT | DUMBBELL | BARBELL | MACHINE | KETTLEBELL | BAND | CABLE | OTHER`
  - `difficulty` (optional): enum `BEGINNER | INTERMEDIATE | ADVANCED`
  - `search` (optional): string, trim, 1–100 chars — trigram + ILIKE match on Vietnamese/English names
  - `page` (optional): integer ≥1, default `1`
  - `limit` (optional): integer 1–50, default `20`
- Response: `200 OK` — paginated envelope. Each item omits the detail-only fields (`instructions`, `commonMistakes`, `variations`).
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "ex_pushup_standard",
        "nameVi": "Hít đất tiêu chuẩn",
        "nameEn": "Standard Push-Up",
        "muscleGroups": ["CHEST", "TRICEPS", "SHOULDERS"],
        "equipment": "BODYWEIGHT",
        "difficulty": "BEGINNER",
        "caloriesPerMinute": 7.5,
        "thumbnailUrl": null,
        "animation2dUrl": null,
        "youtubeVideoId": "IODxDxX7oi4"
      }
    ],
    "pagination": { "page": 1, "limit": 20, "totalItems": 40, "totalPages": 2, "hasNext": true, "hasPrev": false }
  }
  ```
- Errors:
  - `400 VALIDATION_ERROR`
  - `500 INTERNAL_ERROR`

---

### GET /api/v1/workout/exercises/:id

- Auth: required
- Request: path
  - `id`: slug matching `^ex_[a-z0-9_]+$`
- Response: `200 OK` — all list fields plus `instructions` (string[]), `commonMistakes` (string[]), `variations` (`{ id, name }[]`).
- Errors:
  - `400 VALIDATION_ERROR` — `id` is not a valid slug
  - `404 EXERCISE_NOT_FOUND`
  - `500 INTERNAL_ERROR`

---

### POST /api/v1/workout/sessions

Single-shot log of a completed workout — session + all set logs inserted atomically.

- Auth: required
- Request: body (unknown keys rejected by `.strict()`)
  - `name` (optional): string, trim, 1–200 chars — auto-generated from the dominant muscle group if omitted
  - `performedAt`: ISO 8601 datetime — must not be more than 5 minutes in the future
  - `durationSec` (optional): integer 0–14400, default `0`
  - `caloriesBurned` (optional): integer 0–5000 — overrides the server estimate
  - `notes` (optional): string, max 2000 chars
  - `logs`: array, 1–200 entries. Each entry:
    - `exerciseId`: slug `^ex_[a-z0-9_]+$`
    - `orderIndex`: integer 0–200
    - `setNumber`: integer 1–50
    - `reps` (integer 1–500) **xor** `durationSec` (integer 1–7200) — exactly one required
    - `weightKg` (optional): number 0–500
    - `restSec` (optional): integer 0–900, default `0`
    - `rpe` (optional): integer 1–10
    - `notes` (optional): string, max 500 chars
- Behavior: server computes `estimatedCaloriesBurned` from the logs; `caloriesBurned` = the supplied override or the estimate.
- Response: `201 Created`
  ```json
  {
    "success": true,
    "data": {
      "id": "uuid",
      "name": "Buổi tập ngực",
      "performedAt": "2026-05-21T07:30:00.000Z",
      "durationSec": 2700,
      "estimatedCaloriesBurned": 42,
      "caloriesBurned": 42,
      "totalExercises": 1,
      "totalSets": 3,
      "notes": null,
      "createdAt": "2026-05-21T20:15:00.000Z"
    }
  }
  ```
- Errors:
  - `400 VALIDATION_ERROR` — body fails Zod (incl. a log with both/neither `reps` and `durationSec`, or future `performedAt`)
  - `404 EXERCISE_NOT_FOUND` — a log references an unknown `exerciseId`
  - `500 INTERNAL_ERROR`

---

### GET /api/v1/workout/sessions

- Auth: required
- Request: query (unknown keys rejected by `.strict()`)
  - `from` (optional): ISO datetime — lower bound on `performedAt`
  - `to` (optional): ISO datetime — upper bound on `performedAt`
  - `page` (optional): integer ≥1, default `1`
  - `limit` (optional): integer 1–50, default `20`
- Response: `200 OK` — paginated envelope, newest first. Items carry `totalExercises` / `totalSets`, no logs.
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "uuid",
        "name": "Buổi tập ngực",
        "performedAt": "2026-05-21T07:30:00.000Z",
        "durationSec": 2700,
        "caloriesBurned": 42,
        "totalExercises": 1,
        "totalSets": 3
      }
    ],
    "pagination": { "page": 1, "limit": 20, "totalItems": 3, "totalPages": 1, "hasNext": false, "hasPrev": false }
  }
  ```
- Errors:
  - `400 VALIDATION_ERROR`
  - `500 INTERNAL_ERROR`

---

### GET /api/v1/workout/sessions/:id

- Auth: required
- Request: path
  - `id`: UUID
- Behavior: fetches only if the session belongs to the caller — a non-owner gets 404 (existence is not leaked).
- Response: `200 OK`
  ```json
  {
    "success": true,
    "data": {
      "id": "uuid",
      "name": "Buổi tập ngực",
      "performedAt": "2026-05-21T07:30:00.000Z",
      "durationSec": 2700,
      "estimatedCaloriesBurned": 42,
      "caloriesBurned": 42,
      "notes": null,
      "logs": [
        {
          "id": "uuid",
          "exerciseId": "ex_pushup_standard",
          "exerciseNameSnapshot": "Hít đất tiêu chuẩn",
          "orderIndex": 0,
          "setNumber": 1,
          "reps": 15,
          "weightKg": null,
          "durationSec": null,
          "restSec": 60,
          "rpe": 7,
          "notes": null
        }
      ],
      "createdAt": "2026-05-21T20:15:00.000Z",
      "updatedAt": "2026-05-21T20:15:00.000Z"
    }
  }
  ```
- Errors:
  - `400 VALIDATION_ERROR` — `id` is not a UUID
  - `404 SESSION_NOT_FOUND`
  - `500 INTERNAL_ERROR`

---

### PATCH /api/v1/workout/sessions/:id

- Auth: required
- Request:
  - path: `id` — UUID
  - body (all optional, at least one required, unknown keys rejected): `name` (1–200 chars), `notes` (max 2000), `durationSec` (0–14400), `caloriesBurned` (0–5000)
- Behavior: session-level fields only — set logs are not editable in v1. Non-owner gets 404.
- Response: `200 OK` — the full session detail (same shape as `GET /sessions/:id`).
- Errors:
  - `400 VALIDATION_ERROR` — bad/empty body or non-UUID `id`
  - `404 SESSION_NOT_FOUND`
  - `500 INTERNAL_ERROR`

---

### DELETE /api/v1/workout/sessions/:id

- Auth: required
- Request: path
  - `id`: UUID
- Behavior: hard-deletes the session; its `session_exercise_logs` rows are removed by `ON DELETE CASCADE`. Non-owner gets 404.
- Response: `204 No Content`
- Errors:
  - `400 VALIDATION_ERROR` — `id` is not a UUID
  - `404 SESSION_NOT_FOUND`
  - `500 INTERNAL_ERROR`

---

## PT — `/api/v1/pt`

Personal-trainer marketplace. All endpoints require auth. The PT lifecycle is **verification → profile → courses → students → earnings/withdrawals**.

Routes labelled "PT role" require `requireRole('pt')` — only users with `users.role = 'pt'` (set when an admin approves a verification) pass. Routes under `/students/:studentId/*` additionally require an **active enrollment** between the calling PT and the target student; any failure mode (missing enrollment, refunded enrollment, invalid UUID, unknown student) returns `404 STUDENT_NOT_FOUND` to avoid leaking student existence.

### POST /api/v1/pt/verification

Submit an application to become a verified PT. Any authenticated user may submit. At most one `pending_review` application per user at a time.

- Auth: required
- Request: body (`.strict()`)
  - `fullName`: string, 2–100 chars
  - `dateOfBirth`: ISO date string (age must be 18–80)
  - `citizenIdNumber`: 9–12 digits
  - `citizenIdFrontKey`, `citizenIdBackKey`: opaque file-key strings, 1–256 chars
  - `certificates`: array, 1–10 items — each `{ name, issuedBy, issuedAt: "YYYY-MM-DD", fileKey }`
  - `specialties`: array, 1–5 enums of `WEIGHT_LOSS | MUSCLE_GAIN | STRENGTH_TRAINING | CARDIO | HIIT | YOGA | PILATES | REHABILITATION | NUTRITION_COACHING | POSTPARTUM | SENIOR_FITNESS | SPORTS_PERFORMANCE`
  - `yearsOfExperience`: integer 0–60
  - `bio`: string, 50–2000 chars
  - `bankAccount`: `{ bankCode (2–16 A-Z0-9), accountNumber (6–20 digits), accountHolder (2–100 chars) }`
- Response: `201 Created`
  ```json
  { "success": true, "data": { "verificationId": "uuid", "status": "PENDING_REVIEW", "submittedAt": "...", "estimatedReviewHours": 48 } }
  ```
- Errors: `400 VALIDATION_ERROR`, `404 USER_NOT_FOUND`, `409 ALREADY_PT`, `409 VERIFICATION_PENDING`, `500 INTERNAL_ERROR`

---

### GET /api/v1/pt/verification/status

- Auth: required
- Response: `200 OK` — `{ status: "NONE" }` if no application, otherwise the latest submission's `{ status, submittedAt, reviewedAt, rejectReason, requireResubmit }`.
- Errors: `500 INTERNAL_ERROR`

---

### GET /api/v1/pt/me

- Auth: required (PT role)
- Response: `200 OK` — PT profile (bio, specialties, yearsOfExperience, bankAccount snapshot, `commissionPercent`, `createdAt`)
- Errors: `403 FORBIDDEN`, `404 PT_PROFILE_NOT_FOUND`, `500 INTERNAL_ERROR`

---

### PATCH /api/v1/pt/me

- Auth: required (PT role)
- Request: body (`.strict()`) — at least one of `bio`, `specialties`, `yearsOfExperience`, `bankAccount`. `commissionPercent` is intentionally not editable here (admin-only in a later phase).
- Response: `200 OK` — same shape as `GET /pt/me`
- Errors: `400 VALIDATION_ERROR`, `403 FORBIDDEN`, `404 PT_PROFILE_NOT_FOUND`, `500 INTERNAL_ERROR`

---

### POST /api/v1/pt/courses

Create a course (status defaults to `DRAFT`). Curriculum (modules + lessons) is nested in the body. `displayOrder` must be 0-based and contiguous within each scope.

- Auth: required (PT role)
- Request: body
  - `title`: string, 3–200 chars
  - `description`: string, 20–5000 chars
  - `thumbnailUrl` (optional): string ≤512 chars
  - `priceVnd`: integer 50,000–50,000,000, multiple of 1,000
  - `durationDays`: integer 1–365
  - `tags` (optional): array of ≤10 strings (each ≤40 chars)
  - `modules`: array 1–20 items — each `{ title (3–200), displayOrder (0..N-1), lessons }`
    - `lessons`: array 1–50 items — each `{ title (3–200), youtubeVideoId? (11-char YT id, nullable until publish), durationMin (0–600), displayOrder (0..N-1), isPreview? (boolean, default false — public xem thử flag) }`
- Response: `201 Created` — course summary
  ```json
  { "success": true, "data": { "id": "uuid", "title": "...", "status": "DRAFT", "priceVnd": 1490000, "durationDays": 30, "tags": ["WEIGHT_LOSS"], "totalLessons": 12, "thumbnailUrl": null, "publishedAt": null, "createdAt": "..." } }
  ```
- Errors: `400 VALIDATION_ERROR`, `403 FORBIDDEN`, `500 INTERNAL_ERROR`

---

### GET /api/v1/pt/courses

Own courses (any status).

- Auth: required (PT role)
- Request: query — `status` (optional `DRAFT|PUBLISHED|ARCHIVED`), `page`, `limit`
- Response: `200 OK` — paginated array of course summaries
- Errors: `400 VALIDATION_ERROR`, `403 FORBIDDEN`, `500 INTERNAL_ERROR`

---

### GET /api/v1/pt/courses/:id

Own course detail with full curriculum. Non-owner gets 404 (don't leak).

- Auth: required (PT role)
- Response: `200 OK`
  ```json
  {
    "success": true,
    "data": {
      "id": "uuid", "title": "...", "description": "...", "status": "DRAFT",
      "priceVnd": 1490000, "durationDays": 30, "tags": [], "thumbnailUrl": null,
      "totalLessons": 12, "publishedAt": null, "archivedAt": null,
      "modules": [
        { "id": "uuid", "title": "Tuần 1", "displayOrder": 0,
          "lessons": [ { "id": "uuid", "title": "Day 1", "youtubeVideoId": "abc123", "cloudinaryVideoUrl": null, "isPreview": false, "durationMin": 25, "displayOrder": 0 } ] }
      ],
      "createdAt": "...", "updatedAt": "..."
    }
  }
  ```
  Each lesson carries **`isPreview`** (boolean) and **`cloudinaryVideoUrl`** (nullable) — the latter is the URL of a video uploaded via `POST /pt/courses/:id/lessons/:lessonId/video`. The owner view always includes `cloudinaryVideoUrl`. In the public catalog (`GET /content/pt-courses/:id`) it is exposed **only for lessons where `isPreview` is true** (xem thử); paid lessons (`isPreview` false) omit it so the CDN link never leaks. `isPreview` itself is always present so the client can render the unlock/lock affordance. (Note: `youtubeVideoId` is currently public for every lesson — a separate hardening task, see deferred-work.)
- Errors: `400 VALIDATION_ERROR`, `403 FORBIDDEN`, `404 COURSE_NOT_FOUND`, `500 INTERNAL_ERROR`

---

### PATCH /api/v1/pt/courses/:id

Update metadata. Once any non-refunded enrollment exists, **`priceVnd` and `durationDays` are locked**; title/description/thumbnail/tags remain editable.

- Auth: required (PT role)
- Request: body — at least one of `title | description | thumbnailUrl | priceVnd | durationDays | tags` (same rules as POST)
- Response: `200 OK` — course summary
- Errors: `400 VALIDATION_ERROR`, `403 FORBIDDEN`, `404 COURSE_NOT_FOUND`, `409 COURSE_LOCKED_BY_ENROLLMENTS`, `500 INTERNAL_ERROR`

---

### PUT /api/v1/pt/courses/:id/curriculum

Atomically replace all modules + lessons. **Forbidden once any non-refunded enrollment exists** (bait-and-switch protection).

- Auth: required (PT role)
- Request: body — `{ modules: [...] }` (same nested shape as POST)
- Response: `200 OK` — full course detail (same shape as `GET /pt/courses/:id`)
- Errors: `400 VALIDATION_ERROR`, `403 FORBIDDEN`, `404 COURSE_NOT_FOUND`, `409 COURSE_LOCKED_BY_ENROLLMENTS`, `500 INTERNAL_ERROR`

---

### POST /api/v1/pt/courses/:id/publish

Transition `DRAFT → PUBLISHED`. Every lesson must have a video — **either** a `youtubeVideoId` **or** an uploaded `cloudinaryVideoUrl`.

- Auth: required (PT role)
- Response: `200 OK` — course summary with `status: "PUBLISHED"` and `publishedAt` set
- Errors:
  - `404 COURSE_NOT_FOUND`
  - `409 INVALID_COURSE_STATUS_TRANSITION` — course is not in `DRAFT`
  - `422 CURRICULUM_INCOMPLETE` — has lessons with neither `youtubeVideoId` nor `cloudinaryVideoUrl`; error includes a `details` array of `{ lessonId, lessonTitle, moduleTitle }`

---

### POST /api/v1/pt/courses/:id/archive

Transition `DRAFT|PUBLISHED → ARCHIVED`. Existing enrollments retain access.

- Auth: required (PT role)
- Response: `200 OK` — course summary with `status: "ARCHIVED"` and `archivedAt` set
- Errors: `404 COURSE_NOT_FOUND`, `409 INVALID_COURSE_STATUS_TRANSITION` (already archived)

---

### POST /api/v1/pt/courses/:id/thumbnail

Upload a course cover image to Cloudinary and persist it on `courses.thumbnail_url`. Owner-only (non-owner course → 404).

- Auth: required (PT role)
- Request: `multipart/form-data` with a single file field `thumbnail`
  - Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`
  - Max size: 5 MB
- Response: `200 OK`
  ```json
  { "success": true, "data": { "courseId": "uuid", "thumbnailUrl": "https://res.cloudinary.com/<cloud>/.../course-thumbnails/...jpg" } }
  ```
- Errors:
  - `400 NO_FILE_PROVIDED` / `INVALID_FILE_TYPE` / `FILE_TOO_LARGE` / `INVALID_FIELD_NAME` (field not named `thumbnail`) / `EMPTY_FILE`
  - `INVALID_FILE_TYPE` also fires when the file's bytes don't match the declared `Content-Type` (anti-spoof), not only on a non-whitelisted MIME type.
  - `403 FORBIDDEN` (not a PT)
  - `404 COURSE_NOT_FOUND`
  - `500 UPLOAD_FAILED` — Cloudinary upload failed

---

### POST /api/v1/pt/courses/:id/lessons/:lessonId/video

Upload a lesson video to Cloudinary and persist it on `course_lessons.cloudinary_video_url`. The lesson must belong to the course (verified via `lesson → module → course`) and the course must be owned by the caller. Provides an alternative to `youtubeVideoId` for satisfying the publish requirement.

- Auth: required (PT role)
- Request: `multipart/form-data` with a single file field `video`
  - Allowed MIME type: `video/mp4`
  - Max size: 100 MB
- Response: `200 OK`
  ```json
  { "success": true, "data": { "lessonId": "uuid", "videoUrl": "https://res.cloudinary.com/<cloud>/video/upload/.../course-videos/...mp4" } }
  ```
- Errors:
  - `400 NO_FILE_PROVIDED` / `INVALID_FILE_TYPE` (only MP4 — also rejects a non-MP4 body sent with a spoofed `video/mp4` `Content-Type`) / `FILE_TOO_LARGE` (>100 MB) / `INVALID_FIELD_NAME` (field not named `video`) / `EMPTY_FILE`
  - `403 FORBIDDEN` (not a PT)
  - `404 COURSE_NOT_FOUND` / `LESSON_NOT_FOUND`
  - `500 UPLOAD_FAILED` — Cloudinary upload failed, or the upload exceeded the server-side 120 s Cloudinary timeout

---

### PATCH /api/v1/pt/courses/:id/lessons/:lessonId/preview

Toggle a lesson's public-preview flag (`course_lessons.is_preview`). When `true`, the lesson's `cloudinaryVideoUrl` is exposed in the public course detail (`GET /content/pt-courses/:id`) so non-buyers can xem thử; `false` keeps it hidden (paid). The lesson must belong to the course (`lesson → module → course`) and the course must be owned by the caller. **Not blocked by the curriculum enrollment lock** — it only changes visibility, not curriculum structure, so it works even after the course has enrollments.

> Note: `PUT /pt/courses/:id/curriculum` replaces all lessons, so it resets `isPreview` to whatever the curriculum body specifies (default `false`). Curriculum replace is itself blocked once enrollments exist, so in practice this toggle is the post-publish path and the two do not conflict.

- Auth: required (PT role)
- Request: `application/json`
  ```json
  { "isPreview": true }
  ```
- Response: `200 OK`
  ```json
  { "success": true, "data": { "lessonId": "uuid", "isPreview": true } }
  ```
- Errors:
  - `400 VALIDATION_ERROR` (`isPreview` missing or not a boolean)
  - `403 FORBIDDEN` (not a PT)
  - `404 COURSE_NOT_FOUND` / `LESSON_NOT_FOUND`

---

### GET /api/v1/pt/students

Students enrolled in any of the PT's courses. By default refunded enrollments are excluded.

- Auth: required (PT role)
- Request: query
  - `search` (optional): ILIKE match against `users.full_name`
  - `status` (optional): enum `"ACTIVE" | "COMPLETED" | "REFUNDED"` (explicit `REFUNDED` is honored)
  - `page`, `limit`
- Response: `200 OK` — paginated
  ```json
  {
    "studentId": "uuid", "fullName": "...", "avatarUrl": null,
    "enrollmentId": "uuid", "courseId": "uuid", "courseTitle": "...",
    "status": "ACTIVE", "enrolledAt": "...",
    "daysCompletedPercent": 42,
    "lastActiveAt": "2026-05-13T08:00:00.000Z"
  }
  ```
  `daysCompletedPercent = min(100, round(daysSinceEnrollment / course.durationDays × 100))`. `lastActiveAt` is `GREATEST(MAX(food_logs.consumedAt), MAX(workout_sessions.performedAt))` for the student, or `null` if neither.
- Errors: `400 VALIDATION_ERROR`, `403 FORBIDDEN`, `500 INTERNAL_ERROR`

---

### GET /api/v1/pt/students/:studentId

Coaching dashboard for one student. PII whitelist applies — PT sees `fullName`, `avatarUrl`, computed `age`, `gender`, `heightCm`, `weightKg`, `targetWeightKg`, `goal`, `activityLevel`, stored `metrics` (BMR/TDEE/daily targets), last-7-day summaries, last 5 food_logs, last 5 workout_sessions, current active meal plan (if any), and last 30 days of exercise assignments. Email, phone, password, DOB, and payment history are never exposed.

- Auth: required (PT role + active enrollment)
- Response: `200 OK` — see field shape below
  ```json
  {
    "student": { "id": "uuid", "fullName": "...", "avatarUrl": null, "age": 28, "gender": "MALE", "heightCm": 175, "weightKg": 72.5, "targetWeightKg": 68, "goal": "LOSE_WEIGHT", "activityLevel": "MODERATE" },
    "metrics": { "bmr": 1693, "tdee": 2624, "dailyCalorieTarget": 2124, "macros": { "proteinG": 159, "carbsG": 212, "fatG": 71 } },
    "enrollment": { "id": "uuid", "courseId": "uuid", "courseTitle": "...", "enrolledAt": "...", "daysSinceEnrollment": 13, "daysCompletedPercent": 42, "courseDurationDays": 30, "status": "ACTIVE" },
    "last7Days": {
      "nutrition": { "loggedDaysCount": 5, "avgDailyCalories": 1980, "avgDailyMacros": { "proteinG": 122, "carbsG": 198, "fatG": 65 }, "adherencePercent": 71 },
      "workout":   { "sessionsCount": 3, "totalDurationSec": 8100, "totalCaloriesBurned": 1240 }
    },
    "recentFoodLogs":       [ { "id": "uuid", "consumedAt": "...", "mealType": "LUNCH", "foodName": "...", "calories": 520 } ],
    "recentWorkoutSessions":[ { "id": "uuid", "name": "...", "performedAt": "...", "durationSec": 2700, "caloriesBurned": 287 } ],
    "currentMealPlan": null,
    "recentExerciseAssignments": [],
    "lastActiveAt": "2026-05-13T08:00:00.000Z"
  }
  ```
- Errors: `403 FORBIDDEN`, `404 STUDENT_NOT_FOUND` (invalid UUID or no active enrollment with this PT), `500 INTERNAL_ERROR`

---

### PUT /api/v1/pt/students/:studentId/meal-plan

Assigns a meal plan. Atomically supersedes any existing active meal plan for this enrollment (old row's `superseded_by` points to the new row; only one active row per enrollment, enforced by a partial unique index).

- Auth: required (PT role + active enrollment)
- Request: body
  - `days`: array 1–31 items — each `{ dayIndex (0..364, unique across the request), meals: array 1–8 items }`
    - `meals` item: `{ mealType: "BREAKFAST"|"LUNCH"|"DINNER"|"SNACK", name (2–200), calories (0–5000), macros: { proteinG (0–500), carbsG (0–2000), fatG (0–500) }, notes? }`
  - `note` (optional): string ≤2000 chars
- Response: `201 Created` — assignment view + a response-only `supersededPreviousAssignmentId` (null if first plan, UUID of the replaced row otherwise)
  ```json
  { "success": true, "data": { "id": "uuid", "type": "MEAL_PLAN", "studentId": "uuid", "enrollmentId": "uuid", "payload": { "days": [...] }, "scheduledFor": null, "note": "...", "createdAt": "...", "supersededPreviousAssignmentId": null } }
  ```
- Errors: `400 VALIDATION_ERROR`, `403 FORBIDDEN`, `404 STUDENT_NOT_FOUND`, `500 INTERNAL_ERROR`

---

### POST /api/v1/pt/students/:studentId/exercises

Assigns an exercise. Accumulates (no supersession). Exactly one of weight-training (`sets` + `reps`, `weightKg` optional) or cardio (`durationSec`) is required.

- Auth: required (PT role + active enrollment)
- Request: body
  - `exerciseId`: string matching `^ex_[a-z0-9_]+$` — must exist in the seeded `exercises` catalog
  - `scheduledDate` (optional): ISO date
  - `sets` (1–20), `reps` (1–500), `weightKg` (0–500), `durationSec` (1–7200), `restSec` (0–900) — XOR enforced (weight-training vs cardio)
  - `note` (optional): ≤1000 chars
- Response: `201 Created` — assignment view (type `EXERCISE_ADDITION`, payload contains the relevant fields)
- Errors: `400 VALIDATION_ERROR`, `403 FORBIDDEN`, `404 STUDENT_NOT_FOUND`, `404 EXERCISE_NOT_FOUND`, `500 INTERNAL_ERROR`

---

### GET /api/v1/pt/earnings

PT's earnings report. All amounts in VND (integer).

- Auth: required (PT role)
- Request: query
  - `from`, `to` (optional): ISO dates — filter on `pt_earnings.created_at`
  - `granularity` (optional): always `"month"` in v1 (day/week deferred)
- Response: `200 OK`
  ```json
  {
    "success": true,
    "data": {
      "totalRevenueVnd": 45200000,
      "platformFeeVnd": 4520000,
      "netEarningsVnd": 40680000,
      "availableBalanceVnd": 28500000,
      "pendingWithdrawalVnd": 5000000,
      "withdrawnTotalVnd": 7180000,
      "breakdown": [
        { "period": "2026-04", "grossVnd": 12000000, "feeVnd": 1200000, "netVnd": 10800000, "transactionsCount": 8 }
      ]
    }
  }
  ```
  `availableBalanceVnd` = `SUM(net_vnd WHERE status NOT IN ('refunded','paid_out') AND now() >= available_at) − SUM(amount_vnd WHERE withdrawal.status IN ('pending_approval','completed'))`. The 7-day hold transition is computed on read (no cron). Rejected withdrawals automatically release reserved balance.
- Errors: `400 VALIDATION_ERROR`, `403 FORBIDDEN`, `500 INTERNAL_ERROR`

---

### POST /api/v1/pt/withdrawals

Request a withdrawal. Bank account is snapshotted from `pt_profiles` at request time (later `PATCH /pt/me` does NOT change in-flight requests).

- Auth: required (PT role)
- Request:
  - header `Idempotency-Key`: string 1–64 chars (required) — repeated key returns the first call's cached response (Redis 24h TTL; backed by DB `UNIQUE (pt_id, idempotency_key)`)
  - body
    - `amountVnd`: integer 200,000–50,000,000, multiple of 1,000, ≤ available balance
    - `note` (optional): ≤500 chars
- Response: **`201 Created`** on the first call, **`200 OK`** on idempotent replay
  ```json
  {
    "success": true,
    "data": {
      "id": "uuid", "amountVnd": 5000000, "status": "PENDING_APPROVAL",
      "bankCode": "VCB", "bankAccountNumber": "0123456789", "bankAccountHolder": "TRAN VAN B",
      "note": "Rút thu nhập tháng 4",
      "requestedAt": "...", "reviewedAt": null,
      "transferReference": null, "rejectionReason": null
    }
  }
  ```
- Errors:
  - `400 VALIDATION_ERROR` — missing/invalid header or body
  - `403 FORBIDDEN`
  - `404 PT_PROFILE_NOT_FOUND`
  - `409 INSUFFICIENT_BALANCE` — `amountVnd > availableBalanceVnd`
  - `500 INTERNAL_ERROR`

---

### GET /api/v1/pt/withdrawals

PT's own withdrawal history.

- Auth: required (PT role)
- Request: query — `status` (optional `PENDING_APPROVAL|COMPLETED|REJECTED`), `page`, `limit`
- Response: `200 OK` — paginated; item shape matches the `POST /pt/withdrawals` response data.
- Errors: `400 VALIDATION_ERROR`, `403 FORBIDDEN`, `500 INTERNAL_ERROR`

---

## Admin — `/api/v1/admin`

All endpoints require `users.role = 'admin'` (enforced router-wide). Non-admin authenticated users get `403 FORBIDDEN`.

### GET /api/v1/admin/pt-verifications

- Request: query — `status` (optional `PENDING_REVIEW|APPROVED|REJECTED`), `page`, `limit`
- Response: `200 OK` — paginated list with `{ id, userId, applicantEmail, applicantName, fullName, status, specialties, yearsOfExperience, submittedAt, reviewedAt }`
- Errors: `400 VALIDATION_ERROR`, `403 FORBIDDEN`, `500 INTERNAL_ERROR`

---

### GET /api/v1/admin/pt-verifications/:id

- Response: `200 OK` — full submission (incl. citizen ID file keys, certificates, bank account)
- Errors: `404 VERIFICATION_NOT_FOUND`, `500 INTERNAL_ERROR`

---

### POST /api/v1/admin/pt-verifications/:id/approve

In one DB transaction: marks the verification `approved`, snapshots the operating data into a new `pt_profiles` row (commission default 10%), and flips `users.role` to `'pt'`. Sends an approval email (fire-and-forget).

- Request: body — `note?` (≤1000 chars)
- Response: `200 OK` — `{ verificationId, status: "APPROVED", userId, ptProfileId, reviewedAt }`
- Errors: `404 VERIFICATION_NOT_FOUND`, `409 VERIFICATION_ALREADY_REVIEWED`, `500 INTERNAL_ERROR`

---

### POST /api/v1/admin/pt-verifications/:id/reject

- Request: body — `reason` (10–1000 chars), `requireResubmit` (boolean, default `true`)
- Response: `200 OK` — `{ verificationId, status: "REJECTED", reviewedAt, rejectReason, requireResubmit }`
- Errors: `400 VALIDATION_ERROR`, `404 VERIFICATION_NOT_FOUND`, `409 VERIFICATION_ALREADY_REVIEWED`, `500 INTERNAL_ERROR`

---

### GET /api/v1/admin/withdrawals

- Request: query — `status` (optional `PENDING_APPROVAL|COMPLETED|REJECTED`), `ptId` (optional UUID), `page`, `limit`
- Response: `200 OK` — paginated; each row is a withdrawal **plus** `ptId` and `ptFullName` (joined from `users`)
- Errors: `400 VALIDATION_ERROR`, `403 FORBIDDEN`, `500 INTERNAL_ERROR`

---

### POST /api/v1/admin/withdrawals/:id/approve

Marks the withdrawal `completed` and records the bank transfer reference. There is no automated bank transfer in v1 — admin completes the transfer in their banking app, then calls this endpoint with the reference. Sends a Vietnamese approval email (fire-and-forget). Balance reflects the change immediately (completed withdrawals continue to count against `availableBalanceVnd`).

- Request: body — `transferReference` (3–64 chars), `note?` (≤500 chars)
- Response: `200 OK` — withdrawal view with `status: "COMPLETED"`, `transferReference`, `reviewedAt` set
- Errors: `400 VALIDATION_ERROR`, `404 WITHDRAWAL_NOT_FOUND`, `409 WITHDRAWAL_ALREADY_REVIEWED`, `500 INTERNAL_ERROR`

---

### POST /api/v1/admin/withdrawals/:id/reject

Marks the withdrawal `rejected` with a reason. The reserved balance is released automatically (rejected rows are excluded from the balance subquery). Sends a Vietnamese rejection email (fire-and-forget).

- Request: body — `reason` (10–500 chars)
- Response: `200 OK` — withdrawal view with `status: "REJECTED"`, `rejectionReason`, `reviewedAt` set
- Errors: `400 VALIDATION_ERROR`, `404 WITHDRAWAL_NOT_FOUND`, `409 WITHDRAWAL_ALREADY_REVIEWED`, `500 INTERNAL_ERROR`

---

### GET /api/v1/admin/articles/:id

Admin draft preview — returns full article detail by id **regardless of status** (draft/published/archived). Same shape as the public `GET /content/articles/:slug` plus a `status` field; does **not** increment `viewCount`.

- Auth: required (`requireRole('admin')`)
- Request: path — `id` (UUID)
- Response: `200 OK` — article detail `{ id, slug, title, excerpt, body, category, author, tags, readingTimeMin, viewCount, publishedAt, status }`; `status` is UPPERCASE (`DRAFT|PUBLISHED|ARCHIVED`)
- Errors: `400 VALIDATION_ERROR` (id not a UUID), `404 ARTICLE_NOT_FOUND`, `500 INTERNAL_ERROR`

---

### POST /api/v1/admin/articles/upload-image

Upload an article cover image to Cloudinary and get its URL back. Unlike avatars, each upload gets a **unique** Cloudinary id (no overwrite); sized to the Open Graph 1.91:1 ratio (1200×630). The URL is returned only — persisting it onto an article is a separate `POST`/`PATCH /admin/articles` call.

- Auth: required (`requireRole('admin')`)
- Content-Type: `multipart/form-data` — field `image` (JPEG/PNG/WebP, ≤ 5 MB)
- Response: `200 OK` — `{ "imageUrl": "https://res.cloudinary.com/.../nutricoach/articles/...jpg" }`
- Errors: `400 NO_FILE_PROVIDED`, `400 EMPTY_FILE`, `400 INVALID_FILE_TYPE`, `400 FILE_TOO_LARGE`, `400 INVALID_FIELD_NAME` (wrong form field), `500 UPLOAD_FAILED`

---

### GET /api/v1/admin/articles

List/search **all** articles regardless of status. Ordered by `createdAt` DESC.

- Auth: required (`requireRole('admin')`)
- Request: query
  - `status` (optional): enum `DRAFT|PUBLISHED|ARCHIVED`
  - `category` (optional): category **slug**
  - `search` (optional, 1–100): trigram + `ILIKE` on `title`
  - `page` (default 1), `limit` (default 20, max 50)
- Response: `200 OK` — paginated. Each item = the public list-item shape **plus** `status` (UPPERCASE) and `createdAt`.
- Errors: `400 VALIDATION_ERROR`, `403 FORBIDDEN`, `500 INTERNAL_ERROR`

---

### POST /api/v1/admin/articles

Create a **draft** article. `slug` is auto-generated from the title (VN diacritic strip + 4-hex suffix) and is **immutable**; `readingTimeMin` is computed (200 wpm).

- Auth: required (`requireRole('admin')`)
- Request: body
  - `title` (3–200), `excerpt` (20–300), `body` (≥ 50, Markdown), `categoryId` (UUID)
  - `coverImageUrl` (optional, ≤ 512, nullable), `tags` (optional, ≤ 10 items, each ≤ 40 chars)
- Response: `201 Created` — admin view:
  ```json
  {
    "id": "uuid", "slug": "...", "title": "...", "excerpt": "...", "body": "...",
    "categoryId": "uuid", "coverImageUrl": null, "tags": ["..."],
    "readingTimeMin": 4, "viewCount": 0, "status": "DRAFT",
    "publishedAt": null, "archivedAt": null, "createdAt": "...", "updatedAt": "..."
  }
  ```
- Errors: `400 VALIDATION_ERROR`, `404 CATEGORY_NOT_FOUND`, `500 INTERNAL_ERROR`

---

### PATCH /api/v1/admin/articles/:id

Update article fields. At least one field required. **`slug` is NOT recomputed** when the title changes (immutable). Changing `body` recomputes `readingTimeMin`.

- Auth: required (`requireRole('admin')`)
- Request: path `id` (UUID); body — any of `title`, `excerpt`, `body`, `categoryId`, `coverImageUrl`, `tags` (same constraints as create)
- Response: `200 OK` — admin view (same shape as create)
- Errors: `400 VALIDATION_ERROR`, `404 ARTICLE_NOT_FOUND`, `404 CATEGORY_NOT_FOUND`, `500 INTERNAL_ERROR`

---

### POST /api/v1/admin/articles/:id/publish

Transition `draft → published`; sets `publishedAt`. Only a `draft` can be published.

- Auth: required (`requireRole('admin')`)
- Request: path `id` (UUID); no body
- Response: `200 OK` — admin view with `status: "PUBLISHED"`, `publishedAt` set
- Errors: `400 VALIDATION_ERROR`, `404 ARTICLE_NOT_FOUND`, `409 INVALID_ARTICLE_STATUS_TRANSITION` (not a draft), `422 ARTICLE_INCOMPLETE` (body < 50 chars), `500 INTERNAL_ERROR`

---

### POST /api/v1/admin/articles/:id/archive

Transition any non-archived status → `archived`; sets `archivedAt`.

- Auth: required (`requireRole('admin')`)
- Request: path `id` (UUID); no body
- Response: `200 OK` — admin view with `status: "ARCHIVED"`, `archivedAt` set
- Errors: `400 VALIDATION_ERROR`, `404 ARTICLE_NOT_FOUND`, `409 INVALID_ARTICLE_STATUS_TRANSITION` (already archived), `500 INTERNAL_ERROR`

---

### POST /api/v1/admin/categories

Create an article category.

- Auth: required (`requireRole('admin')`)
- Request: body
  - `slug` (required): lowercase, `^[a-z0-9-]{2,64}$`
  - `name` (required, 2–100)
  - `displayOrder` (optional int 0–1000, default 0)
- Response: `201 Created` — `{ "id": "uuid", "slug": "...", "name": "...", "displayOrder": 0, "createdAt": "..." }`
- Errors: `400 VALIDATION_ERROR`, `409 CATEGORY_SLUG_EXISTS`, `500 INTERNAL_ERROR`

---

### GET /api/v1/admin/users

List and search users (soft-deleted users excluded). Ordered by `createdAt` DESC.

- Request: query
  - `search` (optional): ILIKE match on `email` or `fullName` (LIKE metacharacters escaped)
  - `role` (optional): enum `USER|PT|ADMIN`
  - `isBanned` (optional): `"true" | "false"`
  - `page` (default 1), `limit` (default 20)
- Response: `200 OK` — paginated. Each user: `{ id, fullName, email, phone, role, tier, emailVerified, isBanned, banReason, bannedAt, createdAt }` (no `password`, no `deletedAt`)
- Errors: `400 VALIDATION_ERROR`, `403 FORBIDDEN`, `500 INTERNAL_ERROR`

---

### GET /api/v1/admin/users/:id

Full user profile with body metrics, points balance, and active subscription.

- Request: path — `id` (UUID)
- Response: `200 OK` — the list shape **plus** `metrics` (same fields as `GET /users/me` metrics, or `null`), `totalPoints` (int), and `subscription` (`{ plan, status, expiresAt }` or `null`)
- Errors: `404 USER_NOT_FOUND`, `500 INTERNAL_ERROR`

---

### POST /api/v1/admin/users/:id/ban

Ban a user account and force logout. In one DB transaction: sets `is_banned = true` + `ban_reason` + `banned_at`, and deletes all of the target's refresh tokens. The auth middleware then rejects the user with `401 ACCOUNT_BANNED` on the next request.

- Request: body — `reason`: string, **min 10 chars** (required)
- Response: `200 OK` — `{ "id": "uuid", "isBanned": true }`
- Errors:
  - `400 VALIDATION_ERROR` / `400 CANNOT_BAN_SELF` (admin's own id)
  - `403 CANNOT_TARGET_ADMIN` (target is another admin)
  - `404 USER_NOT_FOUND`
  - `500 INTERNAL_ERROR`

---

### POST /api/v1/admin/users/:id/unban

Clears `is_banned`, `ban_reason`, `banned_at`.

- Request: path — `id` (UUID)
- Response: `200 OK` — `{ "id": "uuid", "isBanned": false }`
- Errors: `404 USER_NOT_FOUND`, `500 INTERNAL_ERROR`

---

### PATCH /api/v1/admin/users/:id/role

Change a user's role.

- Request: body — `role`: enum `USER|PT|ADMIN` (required)
- Response: `200 OK` — `{ "id": "uuid", "role": "PT" }`
- Note: `req.user.role` comes from the JWT, so a role change is **not effective immediately** — the user must re-login / refresh before the new role takes effect (see CODEBASE_CONTEXT §5 Auth).
- Errors:
  - `400 VALIDATION_ERROR` / `400 CANNOT_CHANGE_OWN_ROLE` (admin's own id)
  - `403 CANNOT_TARGET_ADMIN` (target is another admin)
  - `404 USER_NOT_FOUND`
  - `500 INTERNAL_ERROR`

---

### GET /api/v1/admin/analytics/users

User growth analytics over a date range. Day buckets are computed in the `Asia/Ho_Chi_Minh` timezone.

- Request: query — `range`: enum `7d|30d|90d` (default `30d`)
- Response: `200 OK`
  ```json
  {
    "success": true,
    "data": {
      "range": "30d",
      "totalUsers": 1284,
      "newUsers": 96,
      "data": [ { "date": "2026-05-20", "count": 4 }, { "date": "2026-05-21", "count": 7 } ]
    }
  }
  ```
  `totalUsers` is the all-time non-deleted count; `newUsers` is the sum of `data[].count` within the range; `data` contains only days that had ≥1 signup.
- Errors: `400 VALIDATION_ERROR` (invalid range), `403 FORBIDDEN`, `500 INTERNAL_ERROR`

---

## Content — `/api/v1/content`

Public-ish (any authenticated user) discovery of published PT courses **and articles**. All `/content` endpoints require auth (a deliberate deviation from the spec's "PUBLIC", kept for router consistency). Article `body` is raw Markdown — render it client-side.

### GET /api/v1/content/discover/pt-courses

- Auth: required
- Request: query
  - `search` (optional, 1–100 chars): pg_trgm similarity + `ILIKE` against `courses.title`
  - `tag` (optional, ≤40 chars): exact match against `courses.tags[]`
  - `ptId` (optional UUID)
  - `maxPriceVnd` (optional, 50,000–50,000,000)
  - `page`, `limit`
- Filter: only `status = 'published'`. Draft and archived courses never appear here.
- Sort: with `search`, ranks by title similarity desc then `publishedAt` desc; without, by `publishedAt` desc.
- Response: `200 OK` — paginated
  ```json
  {
    "id": "uuid", "title": "...", "thumbnailUrl": null,
    "priceVnd": 1490000, "durationDays": 30, "tags": ["WEIGHT_LOSS"],
    "totalLessons": 12, "publishedAt": "...",
    "pt": { "id": "uuid", "fullName": "Trần Văn B", "avatarUrl": null, "bioExcerpt": "5 năm kinh nghiệm...", "specialties": ["WEIGHT_LOSS"] }
  }
  ```
  In this **list** view `bioExcerpt` is the first 150 chars of `pt_profiles.bio`. The **detail** view (`GET /content/pt-courses/:id`) returns the same `pt` shape but with the **full** bio in `bioExcerpt`. `avatarUrl` comes from `users.avatar_url` (nullable).
- Errors: `400 VALIDATION_ERROR`, `500 INTERNAL_ERROR`

---

### GET /api/v1/content/pt-courses/:id

- Auth: required
- Response: `200 OK` — full course detail (modules + lessons) + PT info. The `pt` object has the same shape as the list view (`id`, `fullName`, `avatarUrl`, `bioExcerpt`, `specialties`) but `bioExcerpt` here holds the **full, untruncated** bio. Returns `404 COURSE_NOT_FOUND` for unpublished courses (no draft/archived leakage).
- Errors: `400 VALIDATION_ERROR`, `404 COURSE_NOT_FOUND`, `500 INTERNAL_ERROR`

---

### GET /api/v1/content/articles

List published articles (newest first).

- Auth: required
- Request: query
  - `category` (optional, ≤64): category **slug** (resolved to uuid server-side; unknown slug → empty result, not an error)
  - `tag` (optional, ≤40): exact match against `articles.tags[]`
  - `search` (optional, 1–100): `pg_trgm` similarity (> 0.2) **or** `ILIKE` against `title`
  - `page` (default 1), `limit` (default 20, max 50)
- Filter: only `status = 'published'`.
- Sort: with `search`, by title similarity desc then `publishedAt` desc; without, by `publishedAt` desc.
- Response: `200 OK` — paginated. Each list item (**no `body`**):
  ```json
  {
    "id": "uuid", "slug": "...", "title": "...", "excerpt": "...",
    "coverImageUrl": null,
    "category": { "slug": "nutrition", "name": "Dinh dưỡng" },
    "author": { "fullName": "Admin", "avatarUrl": null },
    "tags": ["..."], "readingTimeMin": 4, "viewCount": 12, "publishedAt": "..."
  }
  ```
- Errors: `400 VALIDATION_ERROR`, `500 INTERNAL_ERROR`

---

### GET /api/v1/content/categories

- Auth: required
- Request: none
- Response: `200 OK` — **array (not paginated)**, ordered by `displayOrder` asc then `name` asc:
  ```json
  [{ "id": "uuid", "slug": "nutrition", "name": "Dinh dưỡng", "displayOrder": 0, "articleCount": 7 }]
  ```
  `articleCount` counts **published** articles only. Use `slug` to filter `GET /content/articles?category=<slug>`.
- Errors: `500 INTERNAL_ERROR`

---

### GET /api/v1/content/articles/:slug

- Auth: required
- Request: path — `slug` (1–280 chars)
- Filter: only `status = 'published'`; draft/archived → `404 ARTICLE_NOT_FOUND`.
- Side effect: increments `viewCount` (fire-and-forget, no transaction); the returned `viewCount` already reflects the +1.
- Response: `200 OK` — full detail = the list-item shape **plus** `body` (raw Markdown).
- Errors: `400 VALIDATION_ERROR`, `404 ARTICLE_NOT_FOUND`, `500 INTERNAL_ERROR`

---

## Quests — `/api/v1/quests` & `/api/v1/admin/quests`

Gamification: daily quests, points, and an admin leaderboard. All endpoints require auth; admin endpoints additionally require `requireRole('admin')`. Points live in a dedicated `user_points` table (off the auth hot-path). All per-day logic uses the **VN calendar date** (`Asia/Ho_Chi_Minh`). The quest catalog is seeded by migration 0014 with 7 quests.

**Quest verification model:** `DAILY_LOGIN` is auto-triggered server-side (on `GET /quests/daily`); `PERFECT_DIARY` + `DISCIPLINE_MASTER` are server-computed by `/diary-lock`; `WORKOUT_DONE` is server-verified against `workout_sessions`; `AI_SCAN` is server-verified (`referenceId` must exist in `ai_food_scans` and belong to the calling user); `PT_VISIT`, `DAILY_SHARE` are client-verified with a DB daily cap only.

### GET /api/v1/quests/daily

Active quest catalog + today's per-quest progress. The **first call of a VN day auto-awards `DAILY_LOGIN`**.

- Auth: required
- Request: none
- Response: `200 OK`
  ```json
  {
    "success": true,
    "data": {
      "dailyLoginTriggered": true,
      "totalPoints": 60,
      "quests": [
        {
          "id": "DAILY_LOGIN",
          "title": "Điểm danh mỗi ngày",
          "description": "...",
          "pointsPerCompletion": 10,
          "maxCompletionsPerDay": 1,
          "todayCompletedCount": 1,
          "todayPointsEarned": 10,
          "isCompleted": true
        }
      ]
    }
  }
  ```
  `dailyLoginTriggered` is `true` only on the day's first call (FE shows the "+10 điểm điểm danh!" popup).
- Errors: `401 UNAUTHORIZED`, `500 INTERNAL_ERROR`

---

### POST /api/v1/quests/trigger

Trigger a client-verifiable quest. The enum **excludes** the server-initiated quests (`DAILY_LOGIN`, `PERFECT_DIARY`, `DISCIPLINE_MASTER`) — passing them is a validation error.

- Auth: required
- Request: body
  - `questId`: enum `"AI_SCAN" | "WORKOUT_DONE" | "PT_VISIT" | "DAILY_SHARE"`
  - `date`: string `YYYY-MM-DD`
  - `referenceId` (optional, ≤64 chars): required for `WORKOUT_DONE` (the workout session id); audit-only for the others
- Behavior: `WORKOUT_DONE` verifies the session exists, belongs to the user, and was performed on `date` (VN). `AI_SCAN` is server-verified — `referenceId` must exist in `ai_food_scans` and belong to the calling user. `PT_VISIT`/`DAILY_SHARE` accept the client claim, capped by `maxCompletionsPerDay`.
- Response: `200 OK`
  ```json
  { "success": true, "data": { "triggered": true, "pointsAwarded": 20, "totalPoints": 80 } }
  ```
  `triggered` is `false` (and `pointsAwarded: 0`) when the daily cap is already reached.
- Errors:
  - `400 VALIDATION_ERROR` — bad body, or `DAILY_LOGIN`/`PERFECT_DIARY`/`DISCIPLINE_MASTER` passed
  - `400 REFERENCE_REQUIRED` — `WORKOUT_DONE` without `referenceId`
  - `400 INVALID_REFERENCE` — session not found / not yours / not performed on `date`
  - `404 QUEST_NOT_FOUND` — unknown or inactive quest
  - `500 INTERNAL_ERROR`

---

### POST /api/v1/quests/diary-lock

Server-side check that awards `PERFECT_DIARY` (all of BREAKFAST/LUNCH/DINNER logged for the date) and, if total calories ≤ TDEE, `DISCIPLINE_MASTER`.

- Auth: required
- Request: body
  - `date`: string `YYYY-MM-DD`
- Response: `200 OK`
  ```json
  { "success": true, "data": { "missionsCompleted": ["PERFECT_DIARY", "DISCIPLINE_MASTER"], "pointsAwarded": 80, "totalPoints": 160 } }
  ```
  Calling again the same day yields `missionsCompleted: []` (already awarded).
- Errors:
  - `400 VALIDATION_ERROR`
  - `409 DIARY_INCOMPLETE` — not all 3 meals logged for the date
  - `500 INTERNAL_ERROR`

---

### GET /api/v1/quests/points

Total points + paginated award history.

- Auth: required
- Request: query — `page` (default 1), `limit` (default 20)
- Response: `200 OK`
  ```json
  {
    "success": true,
    "data": {
      "totalPoints": 160,
      "history": [
        { "questId": "DISCIPLINE_MASTER", "questTitle": "Bậc thầy Kỷ luật", "date": "2026-06-03", "completedCount": 1, "pointsEarned": 50 }
      ],
      "pagination": { "page": 1, "limit": 20, "totalItems": 5, "totalPages": 1, "hasNext": false, "hasPrev": false }
    }
  }
  ```
  Note: pagination here sits **inside** `data` (this endpoint's service shape), unlike the sibling-level `pagination` used by list endpoints elsewhere.
- Errors: `401 UNAUTHORIZED`, `500 INTERNAL_ERROR`

---

### GET /api/v1/admin/quests

Quest catalog (all quests, ordered by id). Admin only.

- Auth: required (`requireRole('admin')`)
- Response: `200 OK` — `{ success: true, data: [ <quest rows> ] }`
- Errors: `403 FORBIDDEN`, `500 INTERNAL_ERROR`

---

### POST /api/v1/admin/quests

Create a quest. Admin only.

- Auth: required (`requireRole('admin')`)
- Request: body — `id` (UPPER_SNAKE_CASE), `title`, `description`, `pointsPerCompletion` (int > 0), `maxCompletionsPerDay` (int > 0, default 1), `isActive` (bool, default true)
- Response: `201 Created` — the created quest
- Errors: `400 VALIDATION_ERROR`, `409 QUEST_ID_EXISTS`, `500 INTERNAL_ERROR`

---

### PATCH /api/v1/admin/quests/:id

Update a quest. Admin only.

- Auth: required (`requireRole('admin')`)
- Request: path `id`; body — any of `title`, `description`, `pointsPerCompletion`, `maxCompletionsPerDay`, `isActive`
- Response: `200 OK` — the updated quest
- Errors: `400 VALIDATION_ERROR`, `404 QUEST_NOT_FOUND`, `500 INTERNAL_ERROR`

---

### GET /api/v1/admin/quests/leaderboard

Top users by total points. Admin only.

- Auth: required (`requireRole('admin')`)
- Request: query — `limit` (default 50, capped at 100)
- Response: `200 OK`
  ```json
  { "success": true, "data": [ { "rank": 1, "userId": "uuid", "fullName": "Nguyễn A", "avatarUrl": null, "totalPoints": 320 } ] }
  ```
- Errors: `403 FORBIDDEN`, `500 INTERNAL_ERROR`

---

## Scan — `/api/v1/scan`

AI food scanning via an external Gemini-based microservice. Requires auth.

### POST /api/v1/scan

Uploads a food image (**`multipart/form-data`**, field `image`); the backend converts it to base64 and proxies it to the AI microservice's `/scan` endpoint (vision → dataset retrieval → Vietnamese answer). Persists the image **hash only** (never the base64) in `ai_food_scans` and triggers the `AI_SCAN` quest server-side (quest daily cap 3; the new scan id is the verified `referenceId`). The response is a **structured** food result mapped from the AI extraction (with a regex fallback over the free-text answer).

- Auth: required
- Rate limit: **FREE users are capped at 3 scans per VN calendar day** (`403 SCAN_LIMIT_REACHED`); **PRO users are unlimited**. Enforced inside a transaction with a reserved pending row to prevent TOCTOU races.
- Request: `multipart/form-data`
  - `image`: file (JPG/PNG), required
  - `question` (optional): string, trim, 1–300 chars (body field; unknown keys rejected by `.strict()`)
- Response: `200 OK`
  ```json
  {
    "success": true,
    "data": {
      "scanId": "uuid",
      "foodName": "Phở bò",
      "calories": 350,
      "macros": { "proteinG": 25, "carbsG": 40, "fatG": 8 },
      "confidence": 90,
      "ingredients": ["bánh phở", "thịt bò", "hành"],
      "portion": "1 tô",
      "quest": { "triggered": true, "pointsAwarded": 20, "totalPoints": 80 }
    }
  }
  ```
  Fields are mapped from the AI `extraction` (supporting both a direct object and a `foods[0]` array); missing numbers fall back to regex-parsing `finalAnswer`. `foodName` defaults to `"Unknown Food"`, `portion` to `"1 phần"`. `quest` is `null` if the AI_SCAN quest could not be awarded (e.g. quest daily cap reached) — the scan still succeeds.
- Errors:
  - `400 VALIDATION_ERROR` — missing image file, bad file type/size, or unknown body keys
  - `401 UNAUTHORIZED`
  - `403 SCAN_LIMIT_REACHED` — FREE daily scan cap of 3 reached
  - `503 AI_SERVICE_UNAVAILABLE` — AI microservice unreachable or returned a non-2xx (the reserved pending row is rolled back)
  - `500 INTERNAL_ERROR`

---

### GET /api/v1/quests/rewards

Reward redemption (migration 0016). Points become spendable. Tier is **derived** from `pointsRequired` (`SMALL` ≤ 500 pts, `LARGE` > 500), never stored.

- Auth: required
- Request: none
- Response: `200 OK` — active rewards ordered by `pointsRequired` asc, each `{ id, name, description, pointsRequired, tier, isActive }`
- Errors: `500 INTERNAL_ERROR`

---

### POST /api/v1/quests/redeem

Atomically deducts `pointsRequired` from the caller's `user_points.totalPoints` (conditional `UPDATE ... WHERE total_points >= cost`, so a balance can never go negative) and inserts a `PENDING` redemption snapshotting reward name/cost + delivery address/phone. SMALL rewards (≤ 500 pts) generate a `NUTRI-XXXXXXXX` voucher code and email it (fire-and-forget, after commit); LARGE rewards (> 500 pts) get `voucherCode: null` and are fulfilled offline by an admin.

- Auth: required
- Request: body (unknown keys rejected by `.strict()`)
  - `rewardId`: UUID
  - `deliveryAddress`: string, trim, 5–255 chars
  - `phone`: string, Vietnamese mobile (`^(0|\+84)\d{9}$`)
- Response: `201 Created`
  ```json
  {
    "success": true,
    "data": {
      "redemption": {
        "id": "uuid",
        "rewardId": "uuid",
        "rewardName": "Voucher giảm giá 10.000đ",
        "pointsCost": 100,
        "tier": "SMALL",
        "status": "PENDING",
        "voucherCode": "NUTRI-1A2B3C4D",
        "deliveryAddress": "123 Le Loi, Q1, HCMC",
        "phone": "0901234567",
        "adminNote": null,
        "redeemedAt": "2026-06-04T10:30:00.000Z",
        "fulfilledAt": null
      },
      "totalPoints": 420
    }
  }
  ```
  `totalPoints` is the caller's balance **after** the deduction. `voucherCode` is `null` for LARGE rewards.
- Errors:
  - `400 VALIDATION_ERROR`
  - `404 REWARD_NOT_FOUND` — unknown or inactive reward
  - `409 INSUFFICIENT_POINTS` — balance < cost (**no row inserted, no points changed**)
  - `500 INTERNAL_ERROR`

---

### GET /api/v1/quests/redemptions

- Auth: required
- Request: query — `page` (≥1, default 1), `limit` (1–100, default 20)
- Response: `200 OK` — paginated envelope (sibling `pagination`), the caller's own redemptions newest first; item shape matches the `redemption` object above.
- Errors: `400 VALIDATION_ERROR`, `500 INTERNAL_ERROR`

---

### GET /api/v1/admin/quests/redemptions

- Auth: required (`requireRole('admin')`)
- Request: query — `status` (optional `PENDING|FULFILLED|REJECTED`), `page` (≥1, default 1), `limit` (1–100, default 20)
- Response: `200 OK` — paginated; each row is a redemption **plus** `userId`, `userFullName`, `userEmail` (joined from `users`), newest first.
- Errors: `400 VALIDATION_ERROR`, `403 FORBIDDEN`, `500 INTERNAL_ERROR`

---

### PATCH /api/v1/admin/quests/redemptions/:id/fulfill

Flips `PENDING → FULFILLED` (status-guarded — only one transition wins), sets `fulfilledAt` + `fulfilledByAdminId`. No points change.

- Auth: required (`requireRole('admin')`)
- Request: path — `id` (UUID); body — `adminNote?` (≤500 chars)
- Response: `200 OK` — the updated redemption
- Errors:
  - `400 VALIDATION_ERROR` — id not a UUID
  - `404 REDEMPTION_NOT_FOUND`
  - `409 REDEMPTION_ALREADY_REVIEWED` — status not pending (a second fulfill/reject)
  - `500 INTERNAL_ERROR`

---

### PATCH /api/v1/admin/quests/redemptions/:id/reject

Flips `PENDING → REJECTED` and **refunds** `pointsCost` to the user's `user_points` **exactly once** (guarded by the pending→rejected transition). Sets `fulfilledAt` + `fulfilledByAdminId`.

- Auth: required (`requireRole('admin')`)
- Request: path — `id` (UUID); body — `adminNote` (required, 5–500 chars — reject reason)
- Response: `200 OK` — the updated redemption
- Errors:
  - `400 VALIDATION_ERROR` — id not a UUID, or missing/short `adminNote`
  - `404 REDEMPTION_NOT_FOUND`
  - `409 REDEMPTION_ALREADY_REVIEWED` — status not pending (no double refund)
  - `500 INTERNAL_ERROR`

---

### GET /api/v1/admin/quests/rewards

Admin catalog management — lists **all** rewards including inactive ones (the user-facing `GET /quests/rewards` returns only active). Tier (`SMALL`/`LARGE`) is derived from `pointsRequired`, never stored.

- Auth: required (`requireRole('admin')`)
- Request: query — `page` (default 1), `limit` (1–100, default 20)
- Response: `200 OK` — paginated rewards `{ id, name, description, pointsRequired, tier, isActive, createdAt, updatedAt }`
- Errors: `400 VALIDATION_ERROR`, `403 FORBIDDEN`, `500 INTERNAL_ERROR`

---

### POST /api/v1/admin/quests/rewards

Create a reward.

- Auth: required (`requireRole('admin')`)
- Request: body — `name` (required), `description` (optional), `pointsRequired` (int > 0, required)
- Response: `201 Created` — the created reward
- Errors: `400 VALIDATION_ERROR`, `403 FORBIDDEN`, `500 INTERNAL_ERROR`

---

### PATCH /api/v1/admin/quests/rewards/:id

Partial update — any of `name`, `description`, `pointsRequired`, `isActive`. Use `isActive: false` to deactivate a reward that has redemptions (see DELETE).

- Auth: required (`requireRole('admin')`)
- Request: path — `id` (UUID); body — at least one of the editable fields
- Response: `200 OK` — the updated reward
- Errors: `400 VALIDATION_ERROR`, `404 REWARD_NOT_FOUND`, `500 INTERNAL_ERROR`

---

### DELETE /api/v1/admin/quests/rewards/:id

Soft-delete — sets `isActive = false`. **Refuses** (409) if the reward has existing redemption rows; deactivate via PATCH instead.

- Auth: required (`requireRole('admin')`)
- Request: path — `id` (UUID)
- Response: `200 OK` — `{ id, isActive: false }`
- Errors: `404 REWARD_NOT_FOUND`, `409 REWARD_HAS_REDEMPTIONS`, `500 INTERNAL_ERROR`

---

## Error code reference

| Code | Source | Default status |
|---|---|---|
| VALIDATION_ERROR | Any controller (Zod) | 400 |
| INVALID_VERIFICATION_TOKEN | verify-email | 400 |
| ALREADY_VERIFIED | resend-verification | 400 |
| INVALID_RESET_TOKEN | reset-password | 400 |
| INVALID_JSON | payment webhook (unparseable body) | 400 |
| REFERENCE_REQUIRED | quests trigger (WORKOUT_DONE without referenceId) | 400 |
| INVALID_REFERENCE | quests trigger (WORKOUT_DONE session not found / not yours / wrong date) | 400 |
| NO_FILE_PROVIDED | any upload (avatar / course thumbnail + lesson video / admin article image) — no file part | 400 |
| INVALID_FILE_TYPE | any upload — declared MIME not whitelisted **OR file bytes don't match the declared `Content-Type`** (anti-spoof magic-byte check) | 400 |
| FILE_TOO_LARGE | any upload — over the size cap (images/thumbnail/article image > 5 MB · lesson video > 100 MB) | 400 |
| INVALID_FIELD_NAME | any upload — file sent under the wrong multipart field name | 400 |
| EMPTY_FILE | any upload — zero-byte file | 400 |
| CANNOT_BAN_SELF | admin ban user (own id) | 400 |
| CANNOT_CHANGE_OWN_ROLE | admin change role (own id) | 400 |
| UNAUTHORIZED | auth middleware / authed controllers | 401 |
| INVALID_TOKEN | auth middleware (bad JWT or user gone) / refresh | 401 |
| ACCOUNT_DELETED | auth middleware (`deleted_at` not null) | 401 |
| ACCOUNT_BANNED | auth middleware / login (`is_banned` true; message includes ban reason) | 401 |
| TOKEN_EXPIRED | refresh | 401 |
| INVALID_CREDENTIALS | login | 401 |
| INVALID_CURRENT_PASSWORD | change-password | 401 |
| INVALID_PASSWORD | delete account | 401 |
| INVALID_SIGNATURE | payment webhook (bad PayOS signature) — swallowed, returns 200 | 401 (internal) |
| FORBIDDEN | requireRole middleware (wrong role for PT/admin routes) | 403 |
| CANNOT_TARGET_ADMIN | admin ban / change role (target is another admin) | 403 |
| USER_NOT_FOUND | auth/users/dashboard services (defensive fallback after middleware) | 401 (auth) / 404 (users, dashboard) |
| USER_METRICS_NOT_FOUND | users metrics | 404 |
| FOOD_LOG_NOT_FOUND | nutrition update/delete | 404 |
| FOOD_ITEM_NOT_FOUND | foods getById / nutrition Mode A | 404 |
| EXERCISE_NOT_FOUND | workout exercise detail / session create / pt exercise assignment | 404 |
| SESSION_NOT_FOUND | workout session detail/update/delete | 404 |
| PT_PROFILE_NOT_FOUND | pt GET/PATCH /me, withdrawal create | 404 |
| VERIFICATION_NOT_FOUND | admin pt-verifications get/approve/reject | 404 |
| COURSE_NOT_FOUND | pt course detail/patch/curriculum/publish/archive, payment checkout (PT_COURSE), content detail | 404 |
| STUDENT_NOT_FOUND | pt students :studentId routes (invalid uuid / no active enrollment with this PT) | 404 |
| WITHDRAWAL_NOT_FOUND | admin withdrawals approve/reject | 404 |
| QUEST_NOT_FOUND | quests trigger / admin quest update (unknown or inactive) | 404 |
| ARTICLE_NOT_FOUND | content article detail / admin article update/publish/archive (or not published) | 404 |
| CATEGORY_NOT_FOUND | admin article create/update (unknown categoryId) | 404 |
| REWARD_NOT_FOUND | quests redeem (unknown or inactive reward) | 404 |
| REDEMPTION_NOT_FOUND | admin redemption fulfill/reject (unknown id) | 404 |
| EMAIL_EXISTS | register | 409 |
| ALREADY_PT | pt verification submit (user already a PT) | 409 |
| VERIFICATION_PENDING | pt verification submit (one pending app already) | 409 |
| VERIFICATION_ALREADY_REVIEWED | admin pt-verifications approve/reject (not pending) | 409 |
| COURSE_LOCKED_BY_ENROLLMENTS | pt course patch (price/duration) or curriculum replace, once enrollments exist | 409 |
| INVALID_COURSE_STATUS_TRANSITION | pt course publish/archive (illegal transition) | 409 |
| ALREADY_ENROLLED | payment checkout (PT_COURSE) when user already enrolled | 409 |
| WITHDRAWAL_ALREADY_REVIEWED | admin withdrawal approve/reject (not pending) | 409 |
| INSUFFICIENT_BALANCE | withdrawal create (amount > available balance) | 409 |
| DIARY_INCOMPLETE | quests diary-lock (not all of BREAKFAST/LUNCH/DINNER logged) | 409 |
| QUEST_ID_EXISTS | admin quests create (duplicate id) | 409 |
| INSUFFICIENT_POINTS | quests redeem (balance < cost; atomic deduct matched 0 rows) | 409 |
| REDEMPTION_ALREADY_REVIEWED | admin redemption fulfill/reject (status not pending) | 409 |
| REWARD_HAS_REDEMPTIONS | admin reward delete (reward has redemption rows; deactivate via PATCH) | 409 |
| INVALID_ARTICLE_STATUS_TRANSITION | admin article publish/archive (illegal transition) | 409 |
| CATEGORY_SLUG_EXISTS | admin categories create (duplicate slug) | 409 |
| CURRICULUM_INCOMPLETE | pt course publish (lessons missing youtubeVideoId); includes `details` array | 422 |
| ARTICLE_INCOMPLETE | admin article publish (body too short) | 422 |
| WEBHOOK_PROCESSING_ERROR | payment webhook (processing failed; PayOS retries) | 500 |
| UPLOAD_FAILED | any upload — Cloudinary failure; for lesson video also a stall past the 120 s Cloudinary timeout | 500 |
| PAYOS_UNAVAILABLE | payment checkout (PayOS call failed) | 503 |
| AI_SERVICE_UNAVAILABLE | scan, meal-plans/generate | 503 |
| INTERNAL_ERROR | any (incl. middleware DB lookup, unknown errors) | 500 |
