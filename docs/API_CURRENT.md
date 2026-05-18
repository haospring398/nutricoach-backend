# NutriCoach Backend — Implemented API

Snapshot of endpoints that currently exist in the code. Anything not listed here is unimplemented.

## Conventions

- **Base URL:** `http://192.168.1.13:3000`
- **API prefix:** all endpoints live under `/api/v1` (except `/health`)
- **Auth header (when required):** `Authorization: Bearer <accessToken>`
- **Content-Type:** `application/json` for all request/response bodies
- **Response envelope:**
  - Success: `{ "success": true, "data": <payload> }`
  - Error:   `{ "success": false, "error": { "code": "STRING_CODE", "message": "Human readable" } }`
  - `204 No Content` responses have no body.
- **Authenticated routes** can additionally return these errors from the auth middleware (in addition to anything listed per-endpoint). The middleware fetches the user row on every request to enforce soft-delete:
  - `401 UNAUTHORIZED` — missing/invalid `Authorization` header or missing token
  - `401 INVALID_TOKEN` — token failed JWT verify **or** referenced user row no longer exists
  - `401 ACCOUNT_DELETED` — user's `deleted_at` is not null (soft-deleted account)
  - `500 INTERNAL_ERROR` — DB lookup for the user failed
- **Any endpoint that validates a body/query** can return `400 VALIDATION_ERROR` if Zod rejects the payload; the `message` is the first failing rule.
- **Unhandled errors** return `500 INTERNAL_ERROR`.

## Implementation status

| Module    | Implemented | Notes |
|-----------|-------------|-------|
| Auth      | 9 / 11      | OAuth `POST /auth/google` and `POST /auth/apple` still pending |
| Users     | 6 / 7       | `POST /users/me/avatar` pending |
| Nutrition | 5 / 8       | meal-plan generate/active and weekly summary pending |
| **Total** | **20**      | Planned next: Scan, Workout, PT, Payment |

---

## Health

### `GET /health`

Liveness probe. **No envelope, no auth.**

**200 OK**
```json
{
  "status": "ok",
  "environment": "development",
  "timestamp": "2026-05-16T10:30:00.000Z"
}
```

---

## Auth — `/api/v1/auth`

### `POST /api/v1/auth/register`

**Auth:** no

**Body**
| Field    | Type   | Rules |
|----------|--------|-------|
| fullName | string | trim, 2–100 chars |
| email    | string | trim, lowercased, valid email |
| password | string | min 8 chars, ≥1 uppercase, ≥1 digit |

**201 Created**
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
      "createdAt": "2026-05-16T10:30:00.000Z"
    },
    "accessToken": "<jwt>",
    "refreshToken": "<jwt>"
  }
}
```

**Side effect:** server generates an email-verification token (24h TTL, stored in Redis under `email_verify:<token>`) and fires a verification email via Resend. The send is non-blocking and silent-on-failure — registration succeeds even if Redis or Resend are down.

**Errors**
| Status | Code | When |
|---|---|---|
| 400 | VALIDATION_ERROR | Body fails Zod |
| 409 | EMAIL_EXISTS | Email already registered |
| 500 | INTERNAL_ERROR | DB insert returned no row / unknown |

---

### `POST /api/v1/auth/login`

**Auth:** no

**Body**
| Field    | Type   | Rules |
|----------|--------|-------|
| email    | string | trim, lowercased, valid email |
| password | string | min 1 char |

**200 OK**
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

**Errors**
| Status | Code | When |
|---|---|---|
| 400 | VALIDATION_ERROR | Body fails Zod |
| 401 | INVALID_CREDENTIALS | Email not found or password mismatch |
| 500 | INTERNAL_ERROR | Unknown |

---

### `POST /api/v1/auth/refresh`

**Auth:** no (uses the refresh token from body)

**Body**
| Field        | Type   | Rules |
|--------------|--------|-------|
| refreshToken | string | min 1 char |

**200 OK**
```json
{
  "success": true,
  "data": {
    "accessToken": "<jwt>",
    "refreshToken": "<jwt>"
  }
}
```

The old refresh token is invalidated; clients must store the new one.

**Errors**
| Status | Code | When |
|---|---|---|
| 400 | VALIDATION_ERROR | Body fails Zod |
| 401 | INVALID_TOKEN | Refresh token failed JWT verify, not in DB, or user gone |
| 401 | TOKEN_EXPIRED | Stored refresh token past its `expires_at` |
| 500 | INTERNAL_ERROR | Unknown |

---

### `POST /api/v1/auth/logout`

**Auth:** yes

**Body**
| Field        | Type   | Rules |
|--------------|--------|-------|
| refreshToken | string | min 1 char |

Revokes the given refresh token if it belongs to the caller.

**200 OK**
```json
{ "success": true, "data": { "message": "Logged out" } }
```

**Errors**
| Status | Code | When |
|---|---|---|
| 400 | VALIDATION_ERROR | Body fails Zod |
| 401 | UNAUTHORIZED | `req.user` absent after middleware (defensive) |
| 500 | INTERNAL_ERROR | Unknown |

---

### `GET /api/v1/auth/me`

**Auth:** yes

**200 OK**
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
      "createdAt": "2026-05-16T10:30:00.000Z"
    }
  }
}
```

**Errors** — only middleware errors apply (see Conventions). The service throws `401 USER_NOT_FOUND` if the user row disappears between middleware and controller; practically unreachable but kept as a defensive fallback.

---

### `POST /api/v1/auth/logout-all`

**Auth:** yes

Deletes every row in `refresh_tokens` for the caller. The current access token continues to work until it expires (no DB check for access tokens).

**204 No Content**

**Errors** — only middleware errors apply.

---

### `POST /api/v1/auth/verify-email`

**Auth:** no

**Body**
| Field | Type   | Rules |
|-------|--------|-------|
| token | string | min 1 char — the `evt_…` value from the verification email URL |

Looks up `email_verify:<token>` in Redis, marks the user's `email_verified = true`, deletes the token. Idempotent: if the user is already verified, returns success without changes (and still deletes the token).

**200 OK**
```json
{ "success": true, "data": { "emailVerified": true } }
```

**Errors**
| Status | Code | When |
|---|---|---|
| 400 | VALIDATION_ERROR | Body fails Zod |
| 400 | INVALID_VERIFICATION_TOKEN | Token not found in Redis (never issued, expired, or already consumed); or token's userId no longer exists |

---

### `POST /api/v1/auth/resend-verification`

**Auth:** yes

No body. Generates a new `evt_…` token (overwriting any previous one's mapping by writing a fresh key) and fires a verification email. No rate limiting yet — `TODO: rate limit 1 req/60s per user` lives in the service.

**200 OK**
```json
{ "success": true, "data": { "message": "Verification email sent" } }
```

**Errors**
| Status | Code | When |
|---|---|---|
| 400 | ALREADY_VERIFIED | `users.email_verified` is already `true` |
| 401 | USER_NOT_FOUND | User row missing (defensive — middleware would normally reject first) |

---

### `POST /api/v1/auth/forgot-password`

**Auth:** no

**Body**
| Field | Type   | Rules |
|-------|--------|-------|
| email | string | trim, lowercased, valid email |

Always returns 200 with the same message regardless of whether the email exists or the user is soft-deleted — this prevents account enumeration. If the user is found and not deleted, a `prt_…` reset token (15-minute TTL, stored under `pwd_reset:<token>`) is created and a reset email is sent.

**200 OK**
```json
{
  "success": true,
  "data": { "message": "Nếu email tồn tại, link đặt lại mật khẩu đã được gửi" }
}
```

**Errors**
| Status | Code | When |
|---|---|---|
| 400 | VALIDATION_ERROR | Body fails Zod |

---

### `POST /api/v1/auth/reset-password`

**Auth:** no

**Body**
| Field       | Type   | Rules |
|-------------|--------|-------|
| token       | string | min 1 char — the `prt_…` value from the reset email URL |
| newPassword | string | min 8 chars, ≥1 uppercase, ≥1 digit (same rules as register) |

Verifies the token in Redis, bcrypt-hashes the new password (cost 12), updates `users.password`, deletes the token, and **revokes every refresh token for the user** — they must log in again everywhere.

**200 OK**
```json
{
  "success": true,
  "data": { "message": "Mật khẩu đã được đặt lại thành công" }
}
```

**Errors**
| Status | Code | When |
|---|---|---|
| 400 | VALIDATION_ERROR | Body fails Zod |
| 400 | INVALID_RESET_TOKEN | Token not found in Redis (never issued, expired, or already consumed); or token's userId no longer exists |

---

## Users — `/api/v1/users`

All endpoints require auth.

### `GET /api/v1/users/me`

**200 OK**
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
    "createdAt": "2026-05-16T10:30:00.000Z"
  }
}
```

`metrics` is `null` when the user has not completed onboarding.

**Errors**
| Status | Code | When |
|---|---|---|
| 404 | USER_NOT_FOUND | User row missing |

---

### `PATCH /api/v1/users/me`

**Body** (all optional, but at least one valid field needed for any effect; unknown fields rejected by `.strict()`)

| Field             | Type   | Rules |
|-------------------|--------|-------|
| fullName          | string | trim, 2–100 chars |
| phone             | string | trim, regex `^\+84[0-9]{9}$` |
| avatarUrl         | string | trim, valid URL |
| preferredLanguage | enum   | `vi` \| `en` |

**200 OK** — returns the same shape as `GET /users/me`.

**Errors**
| Status | Code | When |
|---|---|---|
| 400 | VALIDATION_ERROR | Body fails Zod |
| 404 | USER_NOT_FOUND | Update affected no rows |

---

### `POST /api/v1/users/me/onboarding`

Computes BMR / TDEE / daily calorie target / macros (Mifflin–St Jeor) and upserts the `user_metrics` row. Also sets `users.onboarding_completed = true`.

**Body**
| Field               | Type     | Rules |
|---------------------|----------|-------|
| gender              | enum     | `MALE` \| `FEMALE` |
| dateOfBirth         | string   | `YYYY-MM-DD`; computed age ∈ [13, 100] |
| heightCm            | integer  | 100–250 |
| weightKg            | number   | 30–300 |
| activityLevel       | enum     | `SEDENTARY` \| `LIGHT` \| `MODERATE` \| `ACTIVE` \| `VERY_ACTIVE` |
| goal                | enum     | `LOSE_WEIGHT` \| `MAINTAIN` \| `GAIN_WEIGHT` \| `GAIN_MUSCLE` |
| targetWeightKg      | number?  | 30–300 |
| dietaryRestrictions | string[]?| each item trimmed, min 1 char |
| allergies           | string[]?| each item trimmed, min 1 char |

**200 OK**
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

**Errors**
| Status | Code | When |
|---|---|---|
| 400 | VALIDATION_ERROR | Body fails Zod |

---

### `GET /api/v1/users/me/metrics`

**200 OK**
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

`bmiCategory` thresholds: `< 18.5 → UNDERWEIGHT`, `< 25 → NORMAL`, `< 30 → OVERWEIGHT`, otherwise `OBESE`.

**Errors**
| Status | Code | When |
|---|---|---|
| 404 | USER_METRICS_NOT_FOUND | Onboarding not completed |

---

### `POST /api/v1/users/me/change-password`

**Body**
| Field           | Type    | Rules |
|-----------------|---------|-------|
| currentPassword | string  | min 1 char |
| newPassword     | string  | min 8 chars, ≥1 uppercase, ≥1 digit |
| refreshToken    | string? | min 1 char if provided |

If `refreshToken` is provided, every refresh token for the user *except* that one is revoked. If omitted, **all** refresh tokens for the user are revoked.

**204 No Content**

**Errors**
| Status | Code | When |
|---|---|---|
| 400 | VALIDATION_ERROR | Body fails Zod |
| 401 | INVALID_CURRENT_PASSWORD | `currentPassword` does not match |
| 404 | USER_NOT_FOUND | User row missing |

---

### `DELETE /api/v1/users/me`

Soft delete: sets `users.deleted_at = now()` and revokes all refresh tokens for the user. The auth middleware now rejects any subsequent request from a soft-deleted account with `401 ACCOUNT_DELETED`, so previously-issued access tokens are effectively dead immediately.

**Body**
| Field    | Type    | Rules |
|----------|---------|-------|
| password | string  | min 1 char |
| reason   | string? | trim, max 500 chars |

**204 No Content**

**Errors**
| Status | Code | When |
|---|---|---|
| 400 | VALIDATION_ERROR | Body fails Zod |
| 401 | INVALID_PASSWORD | `password` does not match |
| 404 | USER_NOT_FOUND | User row missing |

---

## Nutrition — `/api/v1/nutrition`

All endpoints require auth.

### `POST /api/v1/nutrition/food-logs`

**Body**
| Field      | Type    | Rules |
|------------|---------|-------|
| foodName   | string  | trim, 1–200 chars |
| calories   | integer | 0–10000 |
| proteinG   | number? | 0–500 (default 0) |
| carbsG     | number? | 0–500 (default 0) |
| fatG       | number? | 0–500 (default 0) |
| portion    | number? | 0.25–10 (default 1) — stored as metadata only; `calories`/macros are saved as-is |
| mealType   | enum    | `BREAKFAST` \| `LUNCH` \| `DINNER` \| `SNACK` |
| consumedAt | string? | ISO 8601 datetime with offset; defaults to server `now()` if omitted |

Server-side defaults applied: `sourceType = 'MANUAL'`. Unknown fields rejected by `.strict()`.

**201 Created**
```json
{
  "success": true,
  "data": {
    "foodLogId": "uuid",
    "foodName": "Pho bo",
    "calories": 520,
    "macros": { "proteinG": 32, "carbsG": 68, "fatG": 12 },
    "portion": 1,
    "mealType": "LUNCH",
    "consumedAt": "2026-05-16T12:30:00.000Z"
  }
}
```

**Errors**
| Status | Code | When |
|---|---|---|
| 400 | VALIDATION_ERROR | Body fails Zod |
| 500 | INTERNAL_ERROR | DB insert returned no row |

---

### `GET /api/v1/nutrition/food-logs?date=YYYY-MM-DD`

**Query**
| Param | Type   | Rules |
|-------|--------|-------|
| date  | string | required, `YYYY-MM-DD` |

Filter matches rows where `consumed_at::date = :date::date` and `user_id = caller`, ordered by `consumed_at` ascending.

**200 OK**
```json
{
  "success": true,
  "data": {
    "date": "2026-05-16",
    "meals": {
      "breakfast": [
        {
          "id": "uuid",
          "foodName": "Banh mi",
          "calories": 420,
          "macros": { "proteinG": 18, "carbsG": 55, "fatG": 15 },
          "portion": 1,
          "mealType": "BREAKFAST",
          "consumedAt": "2026-05-16T07:30:00.000Z"
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

**Errors**
| Status | Code | When |
|---|---|---|
| 400 | VALIDATION_ERROR | Missing or malformed `date` |

---

### `PATCH /api/v1/nutrition/food-logs/:id`

**Path param**
| Param | Type   | Rules |
|-------|--------|-------|
| id    | string | UUID |

**Body** (all optional; at least one required, unknown fields rejected)

| Field      | Type    | Rules |
|------------|---------|-------|
| foodName   | string  | trim, 1–200 chars |
| calories   | integer | 0–10000 |
| proteinG   | number  | 0–500 |
| carbsG     | number  | 0–500 |
| fatG       | number  | 0–500 |
| portion    | number  | 0.25–10 |
| mealType   | enum    | `BREAKFAST` \| `LUNCH` \| `DINNER` \| `SNACK` |
| consumedAt | string  | ISO 8601 datetime with offset |

Update is filtered by `id = :id AND user_id = caller`, so non-owners get 404 (not 403).

**200 OK** — returns the same shape as the `POST /food-logs` response.

**Errors**
| Status | Code | When |
|---|---|---|
| 400 | VALIDATION_ERROR | Path or body fails Zod (incl. empty body) |
| 404 | FOOD_LOG_NOT_FOUND | No matching row for this user |

---

### `DELETE /api/v1/nutrition/food-logs/:id`

**Path param**
| Param | Type   | Rules |
|-------|--------|-------|
| id    | string | UUID |

Deletes the row only if it belongs to the caller.

**204 No Content**

**Errors**
| Status | Code | When |
|---|---|---|
| 400 | VALIDATION_ERROR | `id` is not a UUID |
| 404 | FOOD_LOG_NOT_FOUND | No matching row for this user |

---

### `GET /api/v1/nutrition/summary/daily?date=YYYY-MM-DD`

**Query**
| Param | Type   | Rules |
|-------|--------|-------|
| date  | string | required, `YYYY-MM-DD` |

Aggregates the caller's food logs for the given day and compares against the targets stored in `user_metrics`.

**200 OK**
```json
{
  "success": true,
  "data": {
    "date": "2026-05-16",
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

When the user has not completed onboarding, `target`, `remaining`, and `progressPercent` are returned as `null`. `consumed` and `meals` are always present (zeros if no logs).

`progressPercent` is rounded to 1 decimal; macro sums are rounded to 2 decimals.

**Errors**
| Status | Code | When |
|---|---|---|
| 400 | VALIDATION_ERROR | Missing or malformed `date` |

---

## Error code reference

| Code | Source | Default status |
|---|---|---|
| VALIDATION_ERROR | Any controller (Zod) | 400 |
| INVALID_VERIFICATION_TOKEN | verify-email | 400 |
| ALREADY_VERIFIED | resend-verification | 400 |
| INVALID_RESET_TOKEN | reset-password | 400 |
| UNAUTHORIZED | auth middleware / authed controllers | 401 |
| INVALID_TOKEN | auth middleware (bad JWT or user gone) / refresh | 401 |
| ACCOUNT_DELETED | auth middleware (deleted_at not null) | 401 |
| TOKEN_EXPIRED | refresh | 401 |
| INVALID_CREDENTIALS | login | 401 |
| INVALID_CURRENT_PASSWORD | change-password | 401 |
| INVALID_PASSWORD | delete account | 401 |
| USER_NOT_FOUND | auth/users services (defensive fallback after middleware) | 401 (auth) / 404 (users) |
| USER_METRICS_NOT_FOUND | users metrics | 404 |
| FOOD_LOG_NOT_FOUND | nutrition update/delete | 404 |
| EMAIL_EXISTS | register | 409 |
| INTERNAL_ERROR | any (incl. middleware DB lookup) | 500 |
