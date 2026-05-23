# NutriCoach Backend — Codebase Context

> Onboarding snapshot for a fresh Claude Code session. Describes the project as it
> actually is — including the messy parts. When in doubt, read the source; this
> doc is a map, not the territory.

NutriCoach is a REST API for a Vietnamese nutrition + fitness coaching mobile app.
Stack: **Node.js ≥18 · TypeScript 5.9 · Express 4 · PostgreSQL (Drizzle ORM 0.29 /
drizzle-kit 0.20) · Redis (ioredis)**. Layer-based MVC.

---

## 1. Folder structure (`src/`)

```
src/
├── app.ts                  Express app: helmet, cors, json (with rawBody verify
│                           callback for PayOS), morgan, /health, mounts /api/v1
├── server.ts               HTTP server bootstrap + graceful shutdown
│
├── config/
│   ├── db.ts               Drizzle client over node-postgres Pool; exports `db`, `pool`
│   ├── env.ts              Zod-validated env; exports `env`. ONLY place to read env
│   └── redis.ts            ioredis client + `cache` JSON helper (get/set/del/exists)
│
├── models/                 Drizzle table definitions (one file per domain)
│   ├── index.ts            Re-exports every model (the Drizzle `schema` object)
│   ├── user.model.ts       users, refresh_tokens
│   ├── user-metrics.model.ts  user_metrics (onboarding body metrics)
│   ├── food-item.model.ts  food_items (VN NIN catalog)
│   ├── food-log.model.ts   food_logs
│   ├── payment.model.ts    transactions, subscriptions
│   ├── workout.model.ts    exercises, workout_sessions, session_exercise_logs
│   └── pt.model.ts         pt_verifications, pt_profiles
│
├── controllers/            HTTP layer: parse req → call service → envelope response
│   ├── auth.controller.ts        users.controller.ts     nutrition.controller.ts
│   ├── foods.controller.ts       dashboard.controller.ts payment.controller.ts
│   ├── workout.controller.ts     pt.controller.ts        admin.controller.ts
│
├── services/               Business logic; no Express types
│   ├── auth.service.ts           users.service.ts        nutrition.service.ts
│   ├── foods.service.ts          dashboard.service.ts    payment.service.ts
│   ├── workout.service.ts        pt.service.ts
│   └── payment/
│       ├── payos.client.ts       PayOS SDK singleton (throws at boot if creds missing)
│       └── plans.ts              Hardcoded PRO_PLANS price table
│
├── routes/                 Express routers (one per module)
│   ├── index.ts            Aggregator — mounts every module under /api/v1
│   ├── auth.routes.ts            users.routes.ts         nutrition.routes.ts
│   ├── foods.routes.ts           dashboard.routes.ts     payment.routes.ts
│   ├── workout.routes.ts         pt.routes.ts            admin.routes.ts
│
├── validations/            Zod schemas (one file per module, suffix .validation.ts)
│   ├── auth.validation.ts        users.validation.ts     nutrition.validation.ts
│   ├── foods.validation.ts       payment.validation.ts   workout.validation.ts
│   └── pt.validation.ts
│
├── middlewares/
│   ├── auth.middleware.ts  `authenticate` — verifies JWT, fetches user row,
│   │                       rejects soft-deleted accounts; sets req.user
│   └── role.middleware.ts  `requireRole(...roles)` — 403 guard, runs after authenticate
│
├── lib/                    Shared utilities
│   ├── api-error.ts        `ApiError(status, code, message)` base class
│   ├── auth-tokens.ts      Redis-backed email-verify / password-reset tokens
│   ├── email.ts            Resend wrapper + transactional senders (silent-fail)
│   ├── hash.ts             bcrypt hash/compare (cost 12)
│   ├── jwt.ts              access/refresh token sign + verify (HS256)
│   └── user-presenter.ts   role/tier lowercase-DB → uppercase-API mappers
│
├── db/
│   ├── migrate.ts          Migration runner (`npm run db:migrate`)
│   ├── migrations/         0000–0009 .sql files + meta/ (drizzle journal+snapshots)
│   └── seeds/
│       ├── foods.seed.ts       CSV → food_items  (`npm run seed:foods`)
│       └── exercises.seed.ts   JSON → exercises  (`npm run seed:exercises`)
│
└── types/
    └── express.d.ts        Augments Express Request with `user` and `rawBody`
```

Seed data lives outside `src/`: `data/seed/vn_food.csv`, `vn_dishes.csv`, `exercises.json`.

---

## 2. Database tables

16 tables across 7 model files. PKs are `uuid` unless noted.

### `user.model.ts`
- **users** — `id`, `email` (unique), `password` (bcrypt), `fullName`, `phone?`, `avatarUrl?`, `role` (user_role), `tier` (user_tier), `emailVerified`, `onboardingCompleted`, `preferredLanguage`, `createdAt`, `updatedAt`, `deletedAt?` (soft delete)
- **refresh_tokens** — `id`, `userId` → users (cascade), `token` (unique), `expiresAt`, `createdAt`

### `user-metrics.model.ts`
- **user_metrics** — `userId` (**PK** + FK → users), `gender`, `dateOfBirth` (date), `heightCm` (int), `weightKg` (numeric 5,2), `activityLevel`, `goal`, `targetWeightKg?` (numeric), `dietaryRestrictions` (text[]), `allergies` (text[]), `bmr`, `tdee`, `dailyCalorieTarget`, `proteinG`, `carbsG`, `fatG` (all int — onboarding-computed targets), `updatedAt`

### `food-item.model.ts`
- **food_items** — `id`, `externalId` (varchar 32, unique), `source`, `type` (food_type), `nameVi`, `nameEn?`, `category` (varchar 255), `caloriesKcal` (numeric), `proteinG?`/`totalFatG?`/`carbohydrateG?`/`sugarG?`, minerals/vitamins (`calciumMg?` … `vitaminAIu?`), `micronutrients?` (jsonb), `dataCompleteness`, `isVerified`, `createdAt`

### `food-log.model.ts`
- **food_logs** — `id`, `userId` → users (cascade), `foodItemId?` → food_items (set null), `foodName` (varchar 200), `calories` (**integer**), `proteinG?`/`carbsG?`/`fatG?` (numeric 6,2 — **nullable**), `portion` (numeric 4,2 — multiplier), `mealType`, `consumedAt` (**timestamp WITHOUT time zone**), `sourceType`, `scanId?`, `createdAt`

### `payment.model.ts`
- **transactions** — `id`, `userId` → users (restrict), `orderCode` (**bigint**, unique), `productType`, `productRefId?`, `amountVnd` (int), `status`, `paymentLinkId?`, `checkoutUrl?`, `reference?`, `paidAt?`, `expiresAt?`, `failureReason?`, `rawWebhookPayload?` (jsonb), `createdAt`, `updatedAt`
- **subscriptions** — `id`, `userId` → users (cascade), `plan` (product_type), `status`, `startedAt`, `expiresAt`, `autoRenew`, `lastTransactionId?` → transactions, `createdAt`, `updatedAt`

### `workout.model.ts`
- **exercises** — `id` (**varchar 64 slug PK**, e.g. `ex_pushup_standard`), `nameVi`, `nameEn`, `muscleGroups` (**muscle_group[]**), `equipment`, `difficulty`, `caloriesPerMinute` (numeric), `thumbnailUrl?`, `animation2dUrl?`, `youtubeVideoId?`, `instructions?`/`commonMistakes?`/`variations?` (jsonb), `createdAt`, `updatedAt`
- **workout_sessions** — `id`, `userId` → users (cascade), `name`, `performedAt`, `durationSec`, `estimatedCaloriesBurned`, `caloriesBurned`, `notes?`, `createdAt`, `updatedAt`
- **session_exercise_logs** — `id`, `sessionId` → workout_sessions (cascade), `exerciseId` → exercises (restrict), `exerciseNameSnapshot`, `orderIndex`, `setNumber`, `reps?`, `weightKg?` (numeric), `durationSec?`, `restSec`, `rpe?`, `notes?`, `createdAt`

### `pt.model.ts`
- **pt_verifications** — `id`, `userId` → users (cascade), `fullName`, `dateOfBirth` (date), `citizenIdNumber`, `citizenIdFrontKey`/`citizenIdBackKey` (varchar 256 — opaque file keys), `certificates` (jsonb array), `specialties` (text[]), `yearsOfExperience`, `bio`, `bankCode`/`bankAccountNumber`/`bankAccountHolder`, `status` (verification_status), `reviewedByAdminId?` → users, `reviewedAt?`, `reviewNote?`, `requireResubmit?`, `submittedAt`, `createdAt`, `updatedAt`
- **pt_profiles** — `id`, `userId` → users (cascade, **unique**), `bio`, `specialties` (text[]), `yearsOfExperience`, bank fields, `commissionPercent` (default 10), `approvedFromVerificationId?` → pt_verifications, `createdAt`, `updatedAt`

---

## 3. Mounted routes (`src/routes/index.ts`)

All under `/api/v1`. Plus `GET /health` (no auth, no envelope) defined in `app.ts`.

| Mount | Module | Endpoints | List |
|---|---|---:|---|
| `/auth` | auth | 10 | register, login, refresh, logout, logout-all, me, verify-email, resend-verification, forgot-password, reset-password |
| `/users` | users | 6 | me (GET/PATCH/DELETE), me/onboarding, me/metrics, me/change-password |
| `/nutrition` | nutrition | 5 | food-logs (POST/GET/PATCH/DELETE), summary/daily |
| `/foods` | foods | 3 | search, categories, :id |
| `/dashboard` | dashboard | 1 | user |
| `/payment` | payment | 4 | checkout, webhook/payos, transactions, subscription |
| `/workout` | workout | 7 | exercises (list/detail), sessions (POST/GET/GET:id/PATCH/DELETE) |
| `/pt` | pt | 4 | verification (POST), verification/status, me (GET/PATCH) |
| `/admin` | admin | 4 | pt-verifications (list/detail), pt-verifications/:id/approve, /reject |

**44 endpoints total** (+ `/health`). Note: `README.md` / `API_CURRENT.md` say "Auth (9)" — they exclude `GET /auth/me` from the count; the route file has 10 handlers.

Auth requirements: `/auth` register/login/refresh/verify-email/forgot-password/reset-password are public; the rest of `/auth` and all of `/users`, `/nutrition`, `/foods`, `/dashboard`, `/workout` require `authenticate`. `/payment` is `authenticate`-gated except `POST /payment/webhook/payos` (public, PayOS-signature-verified). `/pt` requires `authenticate` (`/pt/me` also `requireRole('pt')`). `/admin` requires `authenticate` + `requireRole('admin')`.

---

## 4. Enums — ⚠️ DB casing is NOT uniform

**API responses are always UPPERCASE.** DB storage casing is split — this is a real
quirk, not a convention. Conversion is only needed for the lowercase group.

### Stored LOWERCASE in DB → must convert to UPPERCASE for API
| Enum | DB values |
|---|---|
| `user_role` | `user, pt, admin` |
| `transaction_status` | `pending, paid, failed, expired, cancelled` |
| `product_type` | `pro_monthly, pro_yearly, pt_course` |
| `subscription_status` | `active, expired, cancelled` |
| `muscle_group` | `chest, back, shoulders, biceps, triceps, legs, glutes, core, cardio, full_body` |
| `equipment` | `bodyweight, dumbbell, barbell, machine, kettlebell, band, cable, other` |
| `difficulty` | `beginner, intermediate, advanced` |
| `verification_status` | `pending_review, approved, rejected` |

### Stored UPPERCASE in DB → API value is identical (no conversion)
| Enum | DB + API values |
|---|---|
| `user_tier` | `FREE, PRO` |
| `gender` | `MALE, FEMALE` |
| `activity_level` | `SEDENTARY, LIGHT, MODERATE, ACTIVE, VERY_ACTIVE` |
| `goal` | `LOSE_WEIGHT, MAINTAIN, GAIN_WEIGHT, GAIN_MUSCLE` |
| `food_type` | `INGREDIENT, DISH` |
| `food_data_completeness` | `FULL, PARTIAL, CALORIES_ONLY` |
| `meal_type` | `BREAKFAST, LUNCH, DINNER, SNACK` |
| `food_log_source` | `MANUAL, SCAN` |

Conversion helpers: `src/lib/user-presenter.ts` (`toPublicRole` maps `user→USER` etc.;
`toPublicTier` is identity). Payment / workout / pt services use inline typed
`toApiEnum`/`toDbEnum` (`Uppercase<T>`/`Lowercase<T>` + `.toUpperCase()`/`.toLowerCase()`).
`specialties` (PT) is a `text[]`, not a pgEnum — stored UPPERCASE, validated by a Zod
allow-list.

---

## 5. Conventions

- **Response envelope**
  - Success: `{ "success": true, "data": <payload> }`
  - Paginated list: `{ "success": true, "data": [...], "pagination": { page, limit, totalItems, totalPages, hasNext, hasPrev } }`
  - Error: `{ "success": false, "error": { "code": "STRING_CODE", "message": "..." } }`
  - `204 No Content` has no body. The PayOS webhook is the one envelope exception (`{ "received": true, "action": "..." }`).
- **Error handling** — no global error middleware. Each controller has local
  `sendSuccess` / `sendError` / `handleError` helpers. `handleError` maps `ZodError`
  → `400 VALIDATION_ERROR`, `ApiError` (and subclasses) → its `status`/`code`/`message`,
  anything else → `500 INTERNAL_ERROR`. Domain errors are thrown as `ApiError`
  subclasses (`AuthError`, `UserError`, `NutritionError`, `FoodsError`,
  `NutritionError`, `PaymentError`, `WorkoutError`, `DashboardError`, `PtError`).
- **MVC file naming** — `*.model.ts` (Drizzle tables), `*.service.ts` (logic),
  `*.controller.ts` (HTTP), `*.routes.ts` (Express router), `*.validation.ts` (Zod).
  One per module, all flat in their layer folder. (Exception: `services/payment/`
  has two support files.)
- **Enum casing** — API always UPPERCASE; DB casing varies (see §4). Convert only the
  lowercase group.
- **Drizzle ORM only** — no raw `pg.Pool.query()`. Raw SQL is allowed only inside
  migration `.sql` files and `sql\`...\`` template tags (used for `similarity()`,
  array `@>`, `AT TIME ZONE`, aggregate casts).
- **Env** — read only via `import { env } from '../config/env'`. Never touch
  `process.env` elsewhere. `env.ts` Zod-validates and exits the process on failure.
- **Auth** — `authenticate` middleware verifies the HS256 JWT, loads the user row,
  rejects soft-deleted accounts (`401 ACCOUNT_DELETED`), sets `req.user = { id, email,
  role }`. `req.user.role` comes from the JWT — it can be **stale** after a role change
  until the user re-logs-in.
- **Migrations** — generated with `npx drizzle-kit generate:pg`, applied with
  `npm run db:migrate`. Never auto-run migrate; the human applies it.

---

## 6. Implemented vs planned

**Implemented (9 modules):** Auth, Users, Nutrition, Foods, Dashboard, Payment (PRO
subscriptions only), Workout (library + session logging), PT (Phase 1: verification +
profile), Admin (PT-verification review scaffold).

**Planned / not built:**
- **Scan** — AI food scanning (OpenAI Vision). `openai` is installed but unused.
- **Content** — articles / discovery.
- **PT Phases 2–4** — courses, students, earnings, withdrawals. `pt.routes.ts` and
  `admin.routes.ts` are designed to be appended to; unbuilt paths 404 by design.
- **Deferred within shipped modules:** live workout-session flow (start/log-set/finish),
  workout programs, `PT_COURSE` checkout (PayOS webhook no-ops it), subscription
  auto-renewal, the cron jobs that expire stale subscriptions / downgrade `users.tier`.

---

## 7. Known schema quirks (read before touching the DB layer)

1. **Enum DB casing is mixed** — see §4. The biggest footgun. A new enum should be
   created lowercase-in-DB (matches the newer modules); but the foods/nutrition/metrics
   enums are uppercase-in-DB and predate that decision.
2. **Things that exist only in migration SQL, not the Drizzle schema** — drizzle-kit
   0.20's DSL can't express them, so they were hand-patched into migration files and
   `db:generate` is blind to them (it won't drop or recreate them):
   - GIN + trigram indexes on `food_items` (name search) and `exercises`
   - GIN index on `exercises.muscle_groups`
   - composite index `food_logs_user_consumed_idx (user_id, consumed_at DESC)`
   - partial unique index `subscriptions_one_active_per_user` (`WHERE status='active'`)
   - partial unique index `pt_verifications_one_pending_per_user` (`WHERE status='pending_review'`)
   - CHECK constraints: `subscriptions_plan_check`, `pt_verifications_age_check`,
     `pt_verifications_experience_check`, `pt_profiles_commission_check`
3. **Array-default bug** — drizzle-kit 0.20 emits `DEFAULT  NOT NULL` (empty) for
   `.array().default([])`. Migration `0002` was hand-patched to `DEFAULT '{}'`. Watch
   for this on any future `text[]` column with a default.
4. **Index column DESC** — drizzle-kit 0.20 can't express a `DESC` index column. Some
   indexes are `ASC` in the model/snapshot but `DESC` in the applied migration SQL
   (`food_logs_user_consumed_idx`, `workout_sessions_user_performed_idx`). Cosmetic
   mismatch; `db:generate` won't churn on it.
5. **`food_logs.consumed_at` is `timestamp WITHOUT time zone`** and stores **UTC
   wall-clock**. To get a VN calendar date you must double-cast:
   `(consumed_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh')::date` — see
   `dashboard.service.ts`. The nutrition daily-summary uses a naive `::date` (UTC day),
   so dashboard and `/nutrition/summary/daily` can disagree near VN midnight.
6. **`food_logs` macros are nullable** — `protein_g/carbs_g/fat_g` (Mode A logs from a
   PARTIAL catalog item leave missing macros NULL; SQL `SUM` skips them). The API
   coerces NULL → 0 in responses to keep the shape stable.
7. **`db:generate` npm script is wrong** — `package.json` has `"drizzle-kit generate"`
   but drizzle-kit 0.20.18 needs the `generate:pg` subcommand. Run
   `npx drizzle-kit generate:pg` directly. drizzle-kit prompts interactively on column
   renames; new tables/columns/indexes generate without prompts.
8. **Hand-written migrations need a journal entry** — `meta/_journal.json` drives
   `db:migrate`. Migration `0006` was hand-written and required a manually-added
   journal entry; the rest were drizzle-generated (which updates the journal).
9. **Boot-time required env** — `JWT_SECRET` + `JWT_REFRESH_SECRET` (≥32 chars, must
   differ), `RESEND_API_KEY`, and `PAYOS_CLIENT_ID`/`PAYOS_API_KEY`/`PAYOS_CHECKSUM_KEY`
   (`payos.client.ts` throws at import if absent). Placeholders are fine in dev.
10. **PayOS SDK is v1.x** (`@payos/node` 1.0.10) — uses `createPaymentLink()` and the
    **synchronous** `verifyPaymentWebhookData()`, not the v2 `paymentRequests` /
    `webhooks` namespaces.

---

## Migrations to date

`0000`–`0009` applied in order: auth/users → user-metrics → users expansion →
food_logs → food_items → category-length fix → food_logs user index → payment →
workout → pt. Run `npm run db:migrate` to apply; `npm run seed:foods` and
`npm run seed:exercises` to populate catalogs.
