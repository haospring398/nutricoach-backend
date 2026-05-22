# NutriCoach Backend — Implemented API

Snapshot of endpoints that actually exist in the route files. Anything not listed here is unimplemented.

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
  - `500 INTERNAL_ERROR` — DB lookup for the user failed
- **Any endpoint with a Zod schema** can return `400 VALIDATION_ERROR` if validation fails; the `message` is the first failing rule.
- **Unhandled errors** in any controller return `500 INTERNAL_ERROR`.

## Implementation status

- Implemented: **Auth (9), Users (6), Nutrition (5), Foods (3), Dashboard (1), Payment (4), Workout (7)**
- Planned: Scan, PT

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

PRO subscriptions via PayOS. PT-course payments are not in v1.

### POST /api/v1/payment/checkout

- Auth: required
- Request:
  - header `Idempotency-Key`: UUID (required) — a repeated key returns the first call's cached response
  - body (unknown keys rejected by `.strict()`)
    - `productType`: enum `"PRO_MONTHLY" | "PRO_YEARLY"` (`PT_COURSE` is rejected in v1)
    - `returnUrl` (optional): valid URL — defaults to `nutricoach://payment/success`
    - `cancelUrl` (optional): valid URL — defaults to `nutricoach://payment/cancel`
- Behavior: creates a `pending` transaction and a PayOS payment link. The response (including `qrCode`) is cached in Redis under the idempotency key for 24h.
- Response: **`201 Created`** on the first call, **`200 OK`** on an idempotent replay (identical body)
  ```json
  {
    "success": true,
    "data": {
      "transactionId": "uuid",
      "orderCode": 1779291633504042,
      "productType": "PRO_MONTHLY",
      "amountVnd": 99000,
      "status": "PENDING",
      "paymentLinkId": "abc123",
      "checkoutUrl": "https://pay.payos.vn/web/abc123",
      "qrCode": "00020101...",
      "expiresAt": "2026-05-21T12:00:00.000Z"
    }
  }
  ```
  Prices: `PRO_MONTHLY` = 99000 VND / 30 days, `PRO_YEARLY` = 899000 VND / 365 days.
- Errors:
  - `400 VALIDATION_ERROR` — missing/invalid `Idempotency-Key`, bad body, or `PT_COURSE`
  - `400 INVALID_PRODUCT` — defensive plan-lookup failure
  - `503 PAYOS_UNAVAILABLE` — PayOS call failed (transaction is marked `failed`)
  - `500 INTERNAL_ERROR`

---

### POST /api/v1/payment/webhook/payos

- Auth: **none** — security is the PayOS signature
- Request: body — the PayOS webhook envelope `{ code, desc, success, data, signature }`. The handler reads the raw request bytes (`req.rawBody`).
- Behavior: verifies the signature, then on a `PAID` event marks the transaction `paid`, activates/extends the user's subscription, and flips `users.tier` to `PRO` — all in one DB transaction. Idempotent: a replay of an already-paid order is a no-op.
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

## Error code reference

| Code | Source | Default status |
|---|---|---|
| VALIDATION_ERROR | Any controller (Zod) | 400 |
| INVALID_VERIFICATION_TOKEN | verify-email | 400 |
| ALREADY_VERIFIED | resend-verification | 400 |
| INVALID_RESET_TOKEN | reset-password | 400 |
| INVALID_PRODUCT | payment checkout | 400 |
| INVALID_JSON | payment webhook (unparseable body) | 400 |
| UNAUTHORIZED | auth middleware / authed controllers | 401 |
| INVALID_TOKEN | auth middleware (bad JWT or user gone) / refresh | 401 |
| ACCOUNT_DELETED | auth middleware (`deleted_at` not null) | 401 |
| TOKEN_EXPIRED | refresh | 401 |
| INVALID_CREDENTIALS | login | 401 |
| INVALID_CURRENT_PASSWORD | change-password | 401 |
| INVALID_PASSWORD | delete account | 401 |
| INVALID_SIGNATURE | payment webhook (bad PayOS signature) — swallowed, returns 200 | 401 (internal) |
| USER_NOT_FOUND | auth/users/dashboard services (defensive fallback after middleware) | 401 (auth) / 404 (users, dashboard) |
| USER_METRICS_NOT_FOUND | users metrics | 404 |
| FOOD_LOG_NOT_FOUND | nutrition update/delete | 404 |
| FOOD_ITEM_NOT_FOUND | foods getById / nutrition Mode A | 404 |
| EXERCISE_NOT_FOUND | workout exercise detail / session create | 404 |
| SESSION_NOT_FOUND | workout session detail/update/delete | 404 |
| EMAIL_EXISTS | register | 409 |
| PAYOS_UNAVAILABLE | payment checkout (PayOS call failed) | 503 |
| WEBHOOK_PROCESSING_ERROR | payment webhook (processing failed; PayOS retries) | 500 |
| INTERNAL_ERROR | any (incl. middleware DB lookup, unknown errors) | 500 |
