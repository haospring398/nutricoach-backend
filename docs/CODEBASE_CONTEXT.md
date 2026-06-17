# NutriCoach Backend — Codebase Context

> Onboarding snapshot for a fresh Claude Code session. Describes the project as it
> actually is — including the messy parts. When in doubt, read the source; this
> doc is a map, not the territory.

NutriCoach is a REST API for a Vietnamese nutrition + fitness coaching mobile app.
Stack: **Node.js ≥18 · TypeScript 5.9 · Express 4 · PostgreSQL (Drizzle ORM 0.29 /
drizzle-kit 0.20) · Redis (ioredis)**. Layer-based MVC.

The **PT (personal-trainer) marketplace is feature-complete** — verification →
courses → students → earnings/withdrawals, end-to-end (Phases 1–4 all shipped).

---

## 1. Folder structure (`src/`)

```
src/
├── app.ts                  Express app: helmet, cors, json (with rawBody verify
│                           callback for PayOS), morgan, /health, Swagger UI at
│                           /api-docs (+ /api-docs.json), mounts /api/v1
├── server.ts               HTTP server bootstrap + graceful shutdown
│
├── config/
│   ├── db.ts               Drizzle client over node-postgres Pool; exports `db`, `pool`
│   ├── env.ts              Zod-validated env; exports `env`. ONLY place to read env
│   ├── redis.ts            ioredis client + `cache` JSON helper (get/set/del/exists)
│   ├── cloudinary.ts       Cloudinary SDK singleton (avatar uploads); reads CLOUDINARY_*
│   └── swagger.ts          swagger-jsdoc spec (OpenAPI 3.0); component schemas + tags.
│                           Globs `./src/routes/*.ts` + app.ts for @openapi JSDoc.
│
├── models/                 Drizzle table definitions (one file per domain)
│   ├── index.ts            Re-exports every model (the Drizzle `schema` object)
│   ├── user.model.ts            users, refresh_tokens
│   ├── user-metrics.model.ts    user_metrics (onboarding body metrics)
│   ├── food-item.model.ts       food_items (VN NIN catalog)
│   ├── food-log.model.ts        food_logs
│   ├── payment.model.ts         transactions, subscriptions
│   ├── workout.model.ts         exercises, workout_sessions, session_exercise_logs
│   ├── pt.model.ts              pt_verifications, pt_profiles
│   ├── course.model.ts          courses, course_modules, course_lessons, enrollments
│   ├── pt-assignment.model.ts   pt_assignments
│   ├── pt-earnings.model.ts     pt_earnings, withdrawals
│   ├── content.model.ts         articles, article_categories
│   ├── quest.model.ts           quests, daily_mission_logs, user_points
│   └── ai-food-scan.model.ts    ai_food_scans
│
├── controllers/            HTTP layer: parse req → call service → envelope response
│   ├── auth.controller.ts        users.controller.ts        nutrition.controller.ts
│   ├── foods.controller.ts       dashboard.controller.ts    payment.controller.ts
│   ├── workout.controller.ts     pt.controller.ts           admin.controller.ts
│   ├── course.controller.ts      pt-students.controller.ts  pt-earnings.controller.ts
│   ├── content.controller.ts     quest.controller.ts        scan.controller.ts
│
├── services/               Business logic; no Express types
│   ├── auth.service.ts           users.service.ts           nutrition.service.ts
│   ├── foods.service.ts          dashboard.service.ts       payment.service.ts
│   ├── workout.service.ts        pt.service.ts              course.service.ts
│   ├── pt-students.service.ts    pt-earnings.service.ts     content.service.ts
│   ├── quest.service.ts          scan.service.ts
│   └── payment/
│       ├── payos.client.ts       PayOS SDK singleton (throws at boot if creds missing)
│       └── plans.ts              Hardcoded PRO_PLANS price table
│
├── routes/                 Express routers (one per module)
│   ├── index.ts            Aggregator — mounts every module under /api/v1
│   ├── auth.routes.ts            users.routes.ts            nutrition.routes.ts
│   ├── foods.routes.ts           dashboard.routes.ts        payment.routes.ts
│   ├── workout.routes.ts         pt.routes.ts               admin.routes.ts
│   ├── content.routes.ts         quest.routes.ts            scan.routes.ts
│   │   (admin.routes.ts also carries the /admin/articles, /admin/categories,
│   │    and /admin/quests sub-routes; content.routes.ts carries PT-course
│   │    discovery + article read endpoints)
│
├── validations/            Zod schemas (one file per module, suffix .validation.ts)
│   ├── auth.validation.ts        users.validation.ts        nutrition.validation.ts
│   ├── foods.validation.ts       payment.validation.ts      workout.validation.ts
│   ├── pt.validation.ts          course.validation.ts       pt-assignment.validation.ts
│   ├── pt-earnings.validation.ts content.validation.ts      quest.validation.ts
│   ├── scan.validation.ts
│
├── middlewares/
│   ├── auth.middleware.ts       `authenticate` — verifies JWT, fetches user row,
│   │                            rejects soft-deleted accounts; sets req.user
│   ├── role.middleware.ts       `requireRole(...roles)` — 403 guard, after authenticate
│   ├── pt-access.middleware.ts  `requirePtAccessToStudent` — 404-not-403 enrollment
│   │                            gate for /pt/students/:studentId/*; sets req.enrollment
│   └── upload.middleware.ts     `uploadSingle(field)` — multer memoryStorage, 5 MB +
│                                MIME whitelist; stashes errors on req.uploadError
│                                (no global error handler — controller converts them)
│
├── lib/                    Shared utilities
│   ├── api-error.ts        `ApiError(status, code, message)` base class
│   ├── auth-tokens.ts      Redis-backed email-verify / password-reset tokens
│   ├── email.ts            Resend wrapper + transactional senders (silent-fail),
│   │                       incl. PT verification + withdrawal approved/rejected emails
│   ├── hash.ts             bcrypt hash/compare (cost 12)
│   ├── jwt.ts              access/refresh token sign + verify (HS256)
│   ├── slug.ts             slugify() (VN diacritic strip + random suffix) +
│   │                       computeReadingTimeMin() — used by the content module
│   └── user-presenter.ts   role/tier lowercase-DB → uppercase-API mappers
│
├── db/
│   ├── migrate.ts          Migration runner (`npm run db:migrate`)
│   ├── migrations/         0000–0018 .sql files + meta/ (drizzle journal+snapshots)
│   └── seeds/
│       ├── foods.seed.ts       CSV → food_items  (`npm run seed:foods`)
│       └── exercises.seed.ts   JSON → exercises  (`npm run seed:exercises`)
│
└── types/
    └── express.d.ts        Augments Express Request with `user`, `rawBody`,
                            `enrollment`, `uploadError`
```

Seed data lives outside `src/`: `data/seed/vn_food.csv`, `vn_dishes.csv`, `exercises.json`.

**Swagger is live:** `src/config/swagger.ts` is imported by `app.ts` and served at
`/api-docs` (UI) + `/api-docs.json` (raw spec). Every route file carries `@openapi`
JSDoc; `swagger-jsdoc` + `swagger-ui-express` are in `package.json`. Note the `apis`
glob targets `./src/routes/*.ts` — fine under tsx/dev; a compiled `dist/` run would
need `./dist/routes/*.js` added.

**Untracked scratch file:** `Gemini.md` (a prior agent's notes) sits in the repo root,
not git-managed and not part of any module. Leave it alone unless asked.

---

## 2. Database tables

**27 tables across 13 model files.** PKs are `uuid` unless noted.

### `user.model.ts`
- **users** — `id`, `email` (unique), `password` (bcrypt), `fullName`, `phone?`, `avatarUrl?`, `role` (user_role), `tier` (user_tier), `emailVerified`, `onboardingCompleted`, `preferredLanguage`, `createdAt`, `updatedAt`, `deletedAt?` (soft delete), `isBanned` (bool default false), `banReason?` (text), `bannedAt?` (timestamptz) — ban columns added in 0017
- **refresh_tokens** — `id`, `userId` → users (cascade), `token` (unique), `expiresAt`, `createdAt`

### `user-metrics.model.ts`
- **user_metrics** — `userId` (**PK** + FK → users), `gender`, `dateOfBirth` (date), `heightCm` (int), `weightKg` (numeric 5,2), `activityLevel`, `goal`, `targetWeightKg?` (numeric), `dietaryRestrictions` (text[]), `allergies` (text[]), `bmr`, `tdee`, `dailyCalorieTarget`, `proteinG`, `carbsG`, `fatG` (all int — onboarding-computed targets), `updatedAt`

### `food-item.model.ts`
- **food_items** — `id`, `externalId` (varchar 32, unique), `source`, `type` (food_type), `nameVi`, `nameEn?`, `category` (varchar 255), `caloriesKcal` (numeric), `proteinG?`/`totalFatG?`/`carbohydrateG?`/`sugarG?`, minerals/vitamins (`calciumMg?` … `vitaminAIu?`), `micronutrients?` (jsonb), `dataCompleteness`, `isVerified`, `createdAt`

### `food-log.model.ts`
- **food_logs** — `id`, `userId` → users (cascade), `foodItemId?` → food_items (set null), `foodName` (varchar 200), `calories` (**integer**), `proteinG?`/`carbsG?`/`fatG?` (numeric 6,2 — **nullable**), `portion` (numeric 4,2 — multiplier), `mealType`, `consumedAt` (**timestamp WITHOUT time zone**), `sourceType`, `scanId?`, `createdAt`

### `payment.model.ts`
- **transactions** — `id`, `userId` → users (restrict), `orderCode` (**bigint**, unique), `productType` (product_type), `productRefId?` (varchar 64 — holds the course UUID for `pt_course`), `amountVnd` (int), `status`, `paymentLinkId?`, `checkoutUrl?`, `reference?`, `paidAt?`, `expiresAt?`, `failureReason?`, `rawWebhookPayload?` (jsonb), `createdAt`, `updatedAt`
- **subscriptions** — `id`, `userId` → users (cascade), `plan` (product_type), `status`, `startedAt`, `expiresAt`, `autoRenew`, `lastTransactionId?` → transactions, `createdAt`, `updatedAt`

### `workout.model.ts`
- **exercises** — `id` (**varchar 64 slug PK**, e.g. `ex_pushup_standard`), `nameVi`, `nameEn`, `muscleGroups` (**muscle_group[]**), `equipment`, `difficulty`, `caloriesPerMinute` (numeric), `thumbnailUrl?`, `animation2dUrl?`, `youtubeVideoId?`, `instructions?`/`commonMistakes?`/`variations?` (jsonb), `createdAt`, `updatedAt`
- **workout_sessions** — `id`, `userId` → users (cascade), `name`, `performedAt`, `durationSec`, `estimatedCaloriesBurned`, `caloriesBurned`, `notes?`, `createdAt`, `updatedAt`
- **session_exercise_logs** — `id`, `sessionId` → workout_sessions (cascade), `exerciseId` → exercises (restrict), `exerciseNameSnapshot`, `orderIndex`, `setNumber`, `reps?`, `weightKg?` (numeric), `durationSec?`, `restSec`, `rpe?`, `notes?`, `createdAt`

### `pt.model.ts`
- **pt_verifications** — `id`, `userId` → users (cascade), `fullName`, `dateOfBirth` (date), `citizenIdNumber`, `citizenIdFrontKey`/`citizenIdBackKey` (varchar 256 — opaque file keys), `certificates` (jsonb array), `specialties` (text[]), `yearsOfExperience`, `bio`, `bankCode`/`bankAccountNumber`/`bankAccountHolder`, `status` (verification_status), `reviewedByAdminId?` → users, `reviewedAt?`, `reviewNote?`, `requireResubmit?`, `submittedAt`, `createdAt`, `updatedAt`
- **pt_profiles** — `id`, `userId` → users (cascade, **unique**), `bio`, `specialties` (text[]), `yearsOfExperience`, bank fields, `commissionPercent` (int, default 10), `approvedFromVerificationId?` → pt_verifications, `createdAt`, `updatedAt`

### `course.model.ts` (Phase 2)
- **courses** — `id`, `ptId` → users (restrict), `title` (varchar 200), `description` (text), `thumbnailUrl?` (varchar 512), `priceVnd` (int), `durationDays` (int), `tags` (text[]), `status` (course_status, default `draft`), `publishedAt?`, `archivedAt?`, `totalLessons` (int, **service-maintained denormalized count**), `createdAt`, `updatedAt`. Indexes on `pt_id`, `status`, + trigram GIN on `title` (migration). CHECKs: price 50k–50M, duration 1–365, `char_length(trim(title)) ≥ 3`.
- **course_modules** — `id`, `courseId` → courses (cascade), `title` (varchar 200), `displayOrder` (int), timestamps. **UNIQUE (course_id, display_order)**. CHECK `display_order ≥ 0`.
- **course_lessons** — `id`, `moduleId` → course_modules (cascade), `title` (varchar 200), `youtubeVideoId?` (varchar 32 — nullable until publish), `cloudinaryVideoUrl?` (varchar 512 — Cloudinary-hosted video, alternative to `youtubeVideoId`; added in 0018), `durationMin` (int default 0), `displayOrder` (int), timestamps. **UNIQUE (module_id, display_order)**. CHECKs: order ≥ 0, duration 0–600. A lesson is publishable if it has **either** `youtubeVideoId` or `cloudinaryVideoUrl`.
- **enrollments** — `id`, `userId` → users (cascade), `courseId` → courses (restrict), `ptId` → users (restrict, denormalized from course), `transactionId` → transactions (restrict), `status` (enrollment_status, default `active`), `enrolledAt`, `completedAt?`, timestamps. **UNIQUE (transaction_id)** (webhook idempotency). Partial unique **(user_id, course_id) WHERE status != 'refunded'** (no double-enroll). Indexes on user/pt/course. *Owned by Phase 3 conceptually; ships in Phase 2 because the payment webhook writes it.*

### `pt-assignment.model.ts` (Phase 3)
- **pt_assignments** — `id`, `ptId` → users (restrict), `studentId` → users (cascade), `enrollmentId` → enrollments (cascade), `type` (pt_assignment_type), `payload` (jsonb — shape varies by type, validated at Zod), `supersededBy?` (**uuid, self-pointer, intentionally NOT an FK**), `acknowledgedAt?` (reserved, unused in v1), `scheduledFor?` (date), `note?`, timestamps. CHECK `jsonb_typeof(payload) = 'object'`. Partial unique **(enrollment_id) WHERE type = 'meal_plan' AND superseded_by IS NULL** (one active meal plan per enrollment). Indexes: `(pt_id, student_id)`, `(student_id, created_at)`, `(enrollment_id, type)`.

### `pt-earnings.model.ts` (Phase 4)
- **pt_earnings** — `id`, `ptId` → users (restrict), `transactionId` → transactions (restrict), `courseId` → courses (restrict), `enrollmentId` → enrollments (restrict), `grossVnd`, `platformFeeVnd`, `netVnd`, `commissionPercentSnapshot` (int — **immutable rate captured at payment**), `status` (earnings_status, default `on_hold`), `availableAt` (paid_at + 7 days), timestamps. **UNIQUE (transaction_id)** (idempotency). CHECKs: `net = gross - fee` & all ≥ 0; commission 0–50. Indexes on `pt_id`, `(status, available_at)`. This is the **canonical earnings ledger**, not a cache.
- **withdrawals** — `id`, `ptId` → users (restrict), `amountVnd` (int), `bankCode`/`bankAccountNumber`/`bankAccountHolder` (**snapshot at request time**), `status` (withdrawal_status, default `pending_approval`), `idempotencyKey` (varchar 64), `note?`, `requestedAt`, `reviewedByAdminId?` → users (set null), `reviewedAt?`, `transferReference?`, `rejectionReason?`, timestamps. **UNIQUE (pt_id, idempotency_key)** (idempotency safety net behind Redis). CHECK `amount_vnd ≥ 200000 AND amount_vnd % 1000 = 0`. Indexes on `pt_id`, `status`.

### `content.model.ts` (migration 0013)
- **articles** — `id`, `slug` (varchar 280, **unique**, server-generated, **immutable after create**), `title` (varchar 200), `excerpt` (varchar 300), `body` (text — **raw Markdown**, never rendered server-side), `categoryId` → article_categories (restrict), `authorId` → users (restrict, always an admin in v1), `coverImageUrl?` (varchar 512), `tags` (text[]), `readingTimeMin` (int — **server-computed at 200 wpm**), `viewCount` (int default 0 — fire-and-forget increment on detail read), `status` (article_status, default `draft`), `publishedAt?`, `archivedAt?`, timestamps. CHECKs: title trim ≥ 3, excerpt ≥ 20, body ≥ 50. Indexes: `(status, published_at DESC)`, `category_id`, trigram GIN on `title`, GIN on `tags`.
- **article_categories** — `id`, `slug` (varchar 64, **unique**), `name` (varchar 100, Vietnamese), `displayOrder` (int default 0), `createdAt`. Seeded with 5 rows (nutrition, training, lifestyle, recipes, motivation).

### `quest.model.ts` (migration 0014)
- **quests** — `id` (**varchar 64 slug PK**, e.g. `DAILY_LOGIN`), `title` (varchar 200), `description` (text), `pointsPerCompletion` (int), `maxCompletionsPerDay` (int default 1), `isActive` (bool default true), timestamps. **Seeded with 7 rows** (DAILY_LOGIN, AI_SCAN, PERFECT_DIARY, DISCIPLINE_MASTER, WORKOUT_DONE, PT_VISIT, DAILY_SHARE).
- **daily_mission_logs** — `id`, `userId` → users (cascade), `questId` → quests (restrict), `date` (date — VN calendar date), `completedCount` (int default 0), `pointsEarned` (int default 0), `referenceId?` (varchar 64 — dedup/audit key), `createdAt`. **UNIQUE (user_id, quest_id, date)** (one row per user/quest/VN-day; `completedCount` accumulates up to the cap). Index `(user_id, date DESC)`.
- **user_points** — `userId` (**PK** + FK → users, cascade), `totalPoints` (int default 0), `updatedAt`. Separate from `users` so gamification writes stay off the auth hot-path; upserted via `onConflictDoUpdate` on each award. Index `(total_points DESC)`. **Since 0016 this is spendable balance, not lifetime earned** (see quirk #22).

### reward redemption (in `quest.model.ts`, migration 0016)
- **rewards** — `id`, `name` (varchar 200), `description` (text), `pointsRequired` (int — CHECK `> 0`), `isActive` (bool default true), `createdAt`/`updatedAt` (**timestamptz**). **Seeded with 5 rows** (3 SMALL ≤ 500 pts: 100/300/500; 2 LARGE > 500: 800/1000). Tier (`SMALL`/`LARGE`) is **derived from `pointsRequired` in the service, never stored** (`SMALL_REWARD_MAX_POINTS = 500`).
- **reward_redemptions** — `id`, `userId` → users (cascade), `rewardId` → rewards (restrict), `rewardName` (varchar 200 — **snapshot**), `pointsCost` (int — **snapshot**; CHECK `>= 0`), `deliveryAddress` (text — snapshot), `phone` (varchar 20 — snapshot), `status` (redemption_status, default `pending`), `voucherCode?` (varchar 32 — SMALL rewards only), `adminNote?` (text — reject reason / fulfill note), `redeemedAt` (**timestamptz**), `fulfilledAt?` (set on fulfill OR reject), `fulfilledByAdminId?` → users (set null). Indexes: `(user_id, redeemed_at DESC)`, `(status, redeemed_at DESC)`.

### `ai-food-scan.model.ts` (migration 0015)
- **ai_food_scans** — `id`, `userId` → users (cascade), `imageHash` (varchar 64 — **SHA-256 hex of the scanned image; the raw base64 is never stored**), `extraction` (jsonb), `matchedRows` (jsonb, default `'[]'::jsonb`), `finalAnswer` (text, nullable), `createdAt` (**timestamptz** — payment/course/pt majority style). Indexes: `(user_id, created_at)`, `(user_id, image_hash)`. Written by `scan.service`; the row id becomes the server-verified `referenceId` for the AI_SCAN quest.

---

## 3. Mounted routes (`src/routes/index.ts`)

All under `/api/v1`. Plus `GET /health` (no auth, no envelope) defined in `app.ts`.

| Mount | Module | Endpoints | List |
|---|---|---:|---|
| `/auth` | auth | 10 | register, login, refresh, logout, logout-all, me, verify-email, resend-verification, forgot-password, reset-password |
| `/users` | users | 9 | me (GET/PATCH/DELETE), me/onboarding, me/metrics (GET + **PATCH** — update + recompute BMR/TDEE/macros/BMI), me/change-password, me/pt-assignments, **me/avatar (POST — Cloudinary upload)** |
| `/nutrition` | nutrition | 6 | food-logs (POST/GET/PATCH/DELETE), summary/daily, meal-plans/generate (AI) |
| `/foods` | foods | 3 | search, categories, :id |
| `/dashboard` | dashboard | 1 | user |
| `/payment` | payment | 5 | checkout, webhook/payos, transactions, subscription, courses |
| `/workout` | workout | 7 | exercises (list/detail), sessions (POST/GET/GET:id/PATCH/DELETE) |
| `/pt` | pt | 20 | verification (POST), verification/status, me (GET/PATCH), courses (POST/GET/GET:id/PATCH, :id/curriculum PUT, :id/publish, :id/archive, **:id/thumbnail POST, :id/lessons/:lessonId/video POST**), students (GET, GET:studentId, :studentId/meal-plan PUT, :studentId/exercises POST), earnings (GET), withdrawals (POST/GET) |
| `/admin` | admin | 32 | pt-verifications (list/detail/approve/reject), withdrawals (list/approve/reject), **articles (upload-image/list/create/:id GET/:id PATCH/:id publish/:id archive + categories POST)**, **quests (list/create/:id PATCH/leaderboard + redemptions list/:id fulfill/:id reject + rewards list/create/:id PATCH/:id DELETE)**, **users (list/:id GET/:id ban/:id unban/:id role PATCH + analytics/users)** |
| `/content` | content | 5 | discover/pt-courses, pt-courses/:id, **articles (list), categories (list), articles/:slug** |
| `/quests` | quest | 7 | daily, trigger, diary-lock, points, rewards, redeem, redemptions |
| `/scan` | scan | 1 | scan (AI food scan) |

**106 endpoints total** (+ `/health`). The `/admin` mount physically carries 32 handlers spanning
four logical modules: PT review (7), Content/articles write (8 — incl. `upload-image` + the `:id` draft preview), Quests admin (11 — incl. 3 redemption + 4 rewards CRUD), User management (6 — incl. analytics). By logical
module the split is **Auth 10 · Users 9 · Nutrition 6 · Foods 3 · Dashboard 1 · Payment 5 ·
Workout 7 · PT 20 · PT-review/admin 7 · Admin user-mgmt 6 · Content 13 (2 PT-course + 11 articles) · Quests 18
(7 user + 11 admin) · Scan 1** = 106. (PT grew 18 → 20 with course thumbnail + lesson video upload, migration 0018; Quests admin grew 7 → 11 with rewards CRUD; Admin user management is a new group of 6, migration 0017. Content articles = 3 read + 8 write incl. `POST /admin/articles/upload-image`.)

### Auth requirements per mount
- `/auth`: register / login / refresh / verify-email / forgot-password / reset-password are public; the rest require `authenticate`.
- `/users`, `/nutrition`, `/foods`, `/dashboard`, `/workout`, `/content`, `/quests`: all require `authenticate`. (Article read endpoints under `/content` are auth-required for router consistency — a deliberate deviation from the spec's "PUBLIC".)
- `/payment`: `authenticate`-gated **except** `POST /payment/webhook/payos` (public, PayOS-signature-verified).
- `/pt`: requires `authenticate`. `verification` + `verification/status` are open to any authed user (a prospective PT). `me`, `courses/*`, `students/*`, `earnings`, `withdrawals` add `requireRole('pt')`. The `students/:studentId/*` routes additionally chain `requirePtAccessToStudent`.
- `/admin`: `authenticate` + `requireRole('admin')` (applied router-wide) — covers PT review, article/category write, quest admin (list/create/update/leaderboard + rewards CRUD), and user management (list/detail/ban/unban/role + analytics).
- `/quests`: `authenticate` only (any logged-in user). The 4 quest **admin** endpoints live under `/admin/quests/*` (merged into `admin.routes.ts`), not under this mount.

---

## 4. Enums — ⚠️ DB casing is NOT uniform

**API responses are always UPPERCASE.** DB storage casing is split — this is a real
quirk, not a convention. Conversion is only needed for the lowercase group. **23 enums total.**
(The quest module added **no** enums — `daily_mission_logs.date` is a plain `date` column and quest ids are varchar slugs, not a pgEnum.)

### Stored LOWERCASE in DB → must convert to UPPERCASE for API
| Enum | DB values | Since |
|---|---|---|
| `user_role` | `user, pt, admin` | core |
| `transaction_status` | `pending, paid, failed, expired, cancelled` | payment |
| `product_type` | `pro_monthly, pro_yearly, pt_course` | payment |
| `subscription_status` | `active, expired, cancelled` | payment |
| `muscle_group` | `chest, back, shoulders, biceps, triceps, legs, glutes, core, cardio, full_body` | workout |
| `equipment` | `bodyweight, dumbbell, barbell, machine, kettlebell, band, cable, other` | workout |
| `difficulty` | `beginner, intermediate, advanced` | workout |
| `verification_status` | `pending_review, approved, rejected` | PT P1 |
| `course_status` | `draft, published, archived` | **PT P2** |
| `enrollment_status` | `active, completed, refunded` | **PT P2** |
| `pt_assignment_type` | `meal_plan, exercise_addition` | **PT P3** |
| `earnings_status` | `on_hold, available, refunded, paid_out` | **PT P4** |
| `withdrawal_status` | `pending_approval, completed, rejected` | **PT P4** |
| `article_status` | `draft, published, archived` | **content** |
| `redemption_status` | `pending, fulfilled, rejected` | **reward redemption (0016)** |

Notes on the Phase 4 enums:
- `earnings_status` — `paid_out` is **defined but never written** in v1. The `on_hold → available`
  transition is computed on read (time-based, no cron); only `refunded`/`paid_out` would be terminal
  mutations, and neither is wired yet. So stored rows are effectively `on_hold` until a refund flow ships.
- `withdrawal_status` — deliberately 3 states (no separate `approved`); admin "approve" jumps straight to
  `completed` because there's no automated bank-transfer step in v1.

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
`toPublicTier` is identity). Payment / workout / pt / course / pt-students / pt-earnings
services use inline typed `toApiEnum`/`toDbEnum` (`Uppercase<T>`/`Lowercase<T>` +
`.toUpperCase()`/`.toLowerCase()`). `specialties`/`tags` are `text[]`, not pgEnums —
stored UPPERCASE, validated by Zod allow-lists.

---

## 5. Conventions

- **Response envelope**
  - Success: `{ "success": true, "data": <payload> }`
  - Paginated list: `{ "success": true, "data": [...], "pagination": { page, limit, totalItems, totalPages, hasNext, hasPrev } }`
  - Error: `{ "success": false, "error": { "code": "STRING_CODE", "message": "..." } }`
  - Some errors carry `error.details` (e.g. `CURRICULUM_INCOMPLETE` lists offending lessons).
  - `204 No Content` has no body. The PayOS webhook is the one envelope exception (`{ "received": true, "action": "..." }`).
- **Error handling** — no global error middleware. Each controller has local
  `sendSuccess` / `sendError` / `handleError` helpers. `handleError` maps `ZodError`
  → `400 VALIDATION_ERROR`, `ApiError` (and subclasses) → its `status`/`code`/`message`,
  anything else → `500 INTERNAL_ERROR`. Domain errors are thrown as `ApiError`
  subclasses (`AuthError`, `UserError`, `NutritionError`, `FoodsError`, `PaymentError`,
  `WorkoutError`, `DashboardError`, `PtError`, `CourseError`, `PtStudentsError`,
  `PtEarningsError`, `ContentError`, `QuestError`). Middlewares that run before a
  controller (auth / role / pt-access) respond directly with the envelope instead of
  throwing. The **one exception is `uploadSingle`** (multer): it can't respond directly
  (no global handler) so it **stashes** any error on `req.uploadError` and the avatar
  controller converts it (`LIMIT_FILE_SIZE → FILE_TOO_LARGE`, fileFilter `ApiError →
  INVALID_FILE_TYPE`).
- **MVC file naming** — `*.model.ts` (Drizzle tables), `*.service.ts` (logic),
  `*.controller.ts` (HTTP), `*.routes.ts` (Express router), `*.validation.ts` (Zod).
  One per module, all flat in their layer folder. (Exception: `services/payment/`
  has two support files.)
- **Enum casing** — API always UPPERCASE; DB casing varies (see §4). Convert only the
  lowercase group. New enums are created lowercase-in-DB (matches the newer modules).
- **Drizzle ORM only** — no raw `pg.Pool.query()`. Raw SQL is allowed only inside
  migration `.sql` files and `sql\`...\`` template tags (used for `similarity()`,
  `= ANY()`, `FILTER (WHERE ...)`, `date_trunc`, `AT TIME ZONE`, interval math, aggregate casts).
- **Env** — read only via `import { env } from '../config/env'`. Never touch
  `process.env` elsewhere. `env.ts` Zod-validates and exits the process on failure.
- **Auth** — `authenticate` verifies the HS256 JWT, loads the user row, rejects
  soft-deleted accounts (`401 ACCOUNT_DELETED`), sets `req.user = { id, email, role }`.
  `req.user.role` comes from the JWT — it can be **stale** after a role change (e.g. an
  admin approving a PT) until the user re-logs-in / refreshes.
- **Idempotency** — `POST /payment/checkout` and `POST /pt/withdrawals` both take an
  `Idempotency-Key` header, cache the response in Redis (24h TTL), and have a DB unique
  constraint as the safety net if Redis misses. First call → 201, idempotent replay → 200.
- **Migrations** — applied with `npm run db:migrate`. Never auto-run migrate; the human
  applies it. Migrations `0010`–`0014` were **hand-written** (not drizzle-generated) and
  required manual `meta/_journal.json` entries.

### Middlewares (`src/middlewares/`)
- **`authenticate`** (`auth.middleware.ts`) — JWT + user-row load + soft-delete check; sets `req.user`.
- **`requireRole(...roles)`** (`role.middleware.ts`) — runs after `authenticate`; responds `403 FORBIDDEN`
  if `req.user.role` is not in the allow-list. Compares against the lowercase DB role values.
- **`requirePtAccessToStudent`** (`pt-access.middleware.ts`) — guards `/pt/students/:studentId/*`. Requires
  an **active** enrollment where `pt_id = req.user.id AND user_id = :studentId`. **Returns `404
  STUDENT_NOT_FOUND` for every failure mode** (invalid UUID, no enrollment, refunded, unknown student) so a
  PT can't probe for other users' existence. Side effect: attaches the enrollment row to `req.enrollment`
  (typed in `types/express.d.ts`) so the handler doesn't re-query.
- **`uploadSingle(field)`** (`upload.middleware.ts`) — multer `memoryStorage`, 5 MB limit, MIME whitelist
  (`image/jpeg|png|webp`). Used by `POST /users/me/avatar`. Does **not** respond or `next(err)` — it parks
  any error on `req.uploadError` for the controller to convert (no global error handler).

### Payment webhook touchpoints (`payment.service.ts` → `handlePayosWebhook`)
On a verified `PAID` event, inside **one DB transaction**, branches on `transaction.productType`:
- `pro_monthly` / `pro_yearly` → `activateProSubscription` (extend/insert subscription, flip `users.tier = PRO`).
- `pt_course` → `activateCourseEnrollment`: inserts the `enrollments` row (idempotent on `transaction_id`)
  **and** calls `recordPtEarning` to insert the `pt_earnings` row (commission snapshot, `available_at =
  paid_at + 7 days`, `status = on_hold`). Both are idempotent on their `transaction_id` unique indexes; a
  missing course or PT profile logs + skips (the webhook must still return 200).

---

## 6. Implemented vs planned

**Implemented (12 mounted modules):** Auth, Users (incl. **`PATCH /me/metrics`** recompute
and **`POST /me/avatar`** Cloudinary upload), Nutrition (food logging + **AI meal-plan
generation**), Foods, Dashboard, Payment
(PRO subscriptions **+ PT-course purchases**), Workout (library + session logging),
**PT (Phases 1–4 complete: verification → courses → students → earnings/withdrawals, incl. **course thumbnail + lesson video upload to Cloudinary** — migration 0018)**,
Admin (PT-verification review + withdrawal review + article/category write + quest admin incl. **rewards CRUD** + **user management: list/detail/ban/unban/role + growth analytics** — migration 0017),
**Content (PT-course discovery + articles/categories — migration 0013)**,
**Quests (gamification: daily quests, points, leaderboard, **reward redemption** — migrations 0014 + 0016)**,
**Scan (AI food scan: Gemini microservice → dataset match → VN answer; migration 0015)**.
Cross-cutting: **Swagger/OpenAPI** at `/api-docs` (all 106 endpoints annotated).

**Planned / not built:**
- **Scan storage / replay** — `POST /scan` ships (migration 0015) but stores only the image
  **hash** (never the base64); thumbnail/replay and a scan→food_log "confirm" flow are not
  built. The scan calls an **external** Gemini microservice over HTTP; the bundled `openai`
  dep remains installed but unused. AI_SCAN quest verification is now server-side (quirk #18).
- **Deferred within shipped modules:**
  - live workout-session flow (start/log-set/finish), workout programs
  - subscription auto-renewal + the cron that expires stale subscriptions / downgrades `users.tier`
  - **PT-course refunds** — `enrollment_status='refunded'` and `earnings_status='refunded'` are defined
    but no endpoint flips them; balance math already accounts for refunded rows
  - **automated bank transfers** for withdrawals — admin records the transfer reference manually
  - the `on_hold → available` cron for PT earnings — computed inline on read instead
  - PT student history endpoints (`/pt/students/:id/food-logs`, `/workout-sessions`), assignment
    edit/delete, assignment "mark as read", `from_pt_assignment_id` one-tap logging — all Phase-3.5+

---

## 7. Known schema quirks (read before touching the DB layer)

1. **Enum DB casing is mixed** — see §4. The biggest footgun. New enums should be
   created lowercase-in-DB (matches the newer modules); the foods/nutrition/metrics
   enums are uppercase-in-DB and predate that decision.
2. **Things that exist only in migration SQL, not the Drizzle schema** — drizzle-kit
   0.20's DSL can't express them, so they were hand-patched into migration files and
   `db:generate` is blind to them (it won't drop or recreate them):
   - GIN + trigram indexes on `food_items`, `exercises`, and `courses.title` (name search)
   - GIN index on `exercises.muscle_groups`
   - composite index `food_logs_user_consumed_idx (user_id, consumed_at DESC)`
   - partial unique indexes: `subscriptions_one_active_per_user` (`WHERE status='active'`),
     `pt_verifications_one_pending_per_user` (`WHERE status='pending_review'`),
     `enrollments_user_course_active_uq` (`WHERE status != 'refunded'`),
     `pt_assignments_one_active_meal_plan_per_enrollment` (`WHERE type='meal_plan' AND superseded_by IS NULL`)
   - CHECK constraints: `subscriptions_plan_check`, `pt_verifications_age_check`,
     `pt_verifications_experience_check`, `pt_profiles_commission_check`, `courses_*_check`,
     `course_modules_order_check`, `course_lessons_*_check`, `pt_assignments_payload_is_object`,
     `pt_earnings_amounts_check`, `pt_earnings_commission_check`, `withdrawals_amount_check`
3. **Array-default bug** — drizzle-kit 0.20 emits `DEFAULT  NOT NULL` (empty) for
   `.array().default([])`. Migration `0002` was hand-patched to `DEFAULT '{}'`; the
   course `tags` column uses `.default(sql\`'{}'::text[]\`)` to dodge it. Watch for this
   on any future `text[]` column with a default.
4. **Index column DESC** — drizzle-kit 0.20 can't express a `DESC` index column. Some
   indexes are `ASC` in the model/snapshot but `DESC` in the applied migration SQL.
   Cosmetic; `db:generate` won't churn on it.
5. **`food_logs.consumed_at` is `timestamp WITHOUT time zone`** and stores **UTC
   wall-clock**. To get a VN calendar date you must double-cast:
   `(consumed_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh')::date` — see
   `dashboard.service.ts`. The nutrition daily-summary uses a naive `::date` (UTC day),
   so dashboard and `/nutrition/summary/daily` can disagree near VN midnight. (All other
   timestamp columns — payment/course/pt — are `timestamptz`.)
6. **`food_logs` macros are nullable** — `protein_g/carbs_g/fat_g`; SQL `SUM` skips NULLs.
   The API coerces NULL → 0 in responses to keep the shape stable.
7. **`db:generate` npm script is wrong** — `package.json` has `"drizzle-kit generate"`
   but drizzle-kit 0.20.18 needs the `generate:pg` subcommand. Run
   `npx drizzle-kit generate:pg` directly. It prompts interactively on column renames;
   new tables/columns/indexes generate without prompts. **Migrations `0010`–`0014` were
   written by hand** (faster than fighting the interactive prompts for partial uniques +
   CHECKs + seed INSERTs) — keep that pattern for new module tables.
8. **Hand-written migrations need a journal entry** — `meta/_journal.json` drives
   `db:migrate`. Migrations `0006` and `0010`–`0014` were hand-written and required
   manually-added journal entries (idx + tag + a synthetic `when` timestamp). The `tag`
   **must equal the `.sql` filename stem** (e.g. `0014_quest_system`), not a bare name —
   the migrator resolves each entry by `<tag>.sql`.
9. **Boot-time required env** — `JWT_SECRET` + `JWT_REFRESH_SECRET` (≥32 chars, must
   differ), `RESEND_API_KEY`, and `CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/
   `CLOUDINARY_API_SECRET` are **`.min(1)` in the Zod schema** — `env.ts` exits the process
   at boot if any is missing. ⚠️ **Inconsistency:** PayOS creds (`PAYOS_*`) are `.optional()`
   in the schema and guarded *at import* by `payos.client.ts` (throws if absent); Cloudinary
   creds are guarded *by the schema* instead. So a missing Cloudinary var fails boot
   everywhere, whereas a missing PayOS var only fails when the payment client loads.
   Placeholders are fine in dev for all of them.
10. **PayOS SDK is v1.x** (`@payos/node` 1.0.10) — uses `createPaymentLink()` and the
    **synchronous** `verifyPaymentWebhookData()`, not the v2 `paymentRequests` /
    `webhooks` namespaces.

### PT-marketplace-specific gotchas
11. **Meal-plan "self-supersede trick"** (`pt-students.service.ts → putMealPlan`) — the
    partial unique index forbids two active meal plans per enrollment, so you can't insert
    the new plan while the old one is still active. The service sets the old row's
    `superseded_by` to **its own id** first (drops it out of the partial index without
    mutating a user-visible field), inserts the new active row, then repoints the old row's
    `superseded_by` at the real new id. All in one transaction. Documented in a code comment
    — don't "simplify" it.
12. **PT balance is derived, never stored** — there is no `balance_vnd` column.
    `availableBalanceVnd = SUM(net_vnd WHERE status NOT IN ('refunded','paid_out') AND now() >=
    available_at) − SUM(withdrawal.amount_vnd WHERE status IN ('pending_approval','completed'))`.
    Rejected withdrawals release reserved balance automatically (excluded from the filter).
13. **pg returns SUM aggregates as strings** (bigint quirk) even with `COALESCE(...,0)::int`.
    `pt-earnings.service.ts` wraps every aggregate in `x != null ? Number(x) : 0` so callers
    always get a JS number — mirror this in any new earnings/balance query.
14. **Migration `0012` backfill only handles `paid`** — `transaction_status` has **no
    `refunded` value** (refunds aren't wired), so the `pt_earnings` backfill filters
    `t.status = 'paid'` and every backfilled row starts `on_hold`. `commission_percent_snapshot`
    uses the *current* `pt_profiles.commission_percent` (accepted because the rate hasn't changed
    pre-launch; only seed data exists). Idempotent via `ON CONFLICT (transaction_id) DO NOTHING`.
15. **PII whitelist in `pt-students.service.ts`** — the student-detail endpoint NEVER does
    `SELECT *` on `users`. PT sees `fullName`, `avatarUrl`, computed `age` (raw DOB discarded),
    body metrics, and stored daily targets — never email, phone, password, payment history, or tier.

### Content / quest gotchas
16. **Article slugs are immutable** (`content.service.ts`) — generated from the title at create
    (NFD diacritic strip, đ→d, 4-hex suffix); editing the title via PATCH does **not** change the
    slug. `view_count` is a fire-and-forget `UPDATE` outside any transaction (soft metric).
17. **Quest VN-date handling** — `daily_mission_logs.date` is computed in JS via `getVnDateString()`
    (`Intl.DateTimeFormat('en-US', …).formatToParts()` — see quirk #23; previously `en-CA`). `WORKOUT_DONE` verifies the
    session with a **single** `AT TIME ZONE 'Asia/Ho_Chi_Minh'` cast (performed_at is timestamptz);
    `diary-lock` filters `food_logs.consumed_at` with the **double**-cast (see quirk #5). Quest
    `created_at`/`updated_at` are plain `timestamp` (no tz) — the only non-timestamptz timestamps
    outside the food/nutrition tables.
18. **AI_SCAN is client-verified (temporary)** — `quest.service.ts → triggerQuest` accepts the
    client's `referenceId` for `AI_SCAN` with only the DB daily cap (3/day) as a guard; the
    `ai_food_scans` table doesn't exist yet (Scan module unbuilt). A `TODO` comment marks where
    server-side verification must be added when Scan ships. `PT_VISIT` and `DAILY_SHARE` are
    likewise client-verified (cap-only). `WORKOUT_DONE` is the only server-verified trigger.

### Users / avatar gotchas
19. **`numeric(5,2)` columns round-trip as strings** — `user_metrics.weight_kg` /
    `target_weight_kg` (and any `numeric` column) come back from pg as **strings** and Drizzle
    expects **strings on write**. Coerce: `Number(...)` on read, `String(...)` on write. The
    onboarding + `PATCH /me/metrics` paths both do this; `PATCH /me/metrics` reuses the shared
    onboarding helpers (`ageFromDob`/`calculateBmr`/`calculateTdee`/`calculateDailyCalorieTarget`/
    `calculateMacros`/`bmiCategoryFor`) and recomputes **all** derived fields every call. `bmi`/
    `bmiCategory` are response-only (not stored). `gender` + `dateOfBirth` are immutable post-onboarding.
20. **Avatar upload is in-place + orphan-free** — `users.service.ts → uploadAvatar` streams the
    multer buffer to Cloudinary with `public_id: avatar_${userId}` + `overwrite: true` (stable URL,
    re-upload returns the **same** URL, zero orphaned assets), folder `nutricoach/avatars`, transform
    `400×400 fill/face, quality:auto, format:auto` (**`format`, not `fetch_format`**). No migration —
    `users.avatar_url` exists since `0000`. A Cloudinary failure → `500 UPLOAD_FAILED`.

### AI microservice gotchas
21. **AI service is external + boot-required** — `AI_SERVICE_URL` (`z.string().url()`) and
    `AI_SERVICE_SECRET` (`z.string().min(16)`) are boot-required in `env.ts` (same fail-fast
    behavior as `CLOUDINARY_*`, quirk #9 — a missing var exits the process at boot).
    `POST /scan` and `POST /nutrition/meal-plans/generate` call a **separate** Gemini-based
    microservice over HTTP with an `X-AI-Secret` header. If it is unreachable or returns a
    non-2xx, the backend responds **`503 AI_SERVICE_UNAVAILABLE`** and persists nothing — the
    backend itself boots and runs fine with the AI service down (failures are per-request).

### Reward redemption gotchas
22. **`user_points.total_points` is spendable balance, not lifetime earned** — since the reward
    redemption system (migration 0016), redeeming a reward **deducts** points and rejecting a
    redemption **refunds** them. So `total_points` is the current spendable balance, and
    `GET /admin/quests/leaderboard` (which orders by `total_points DESC`) now ranks by **current
    balance**, not cumulative points earned. The per-award history in `daily_mission_logs`
    (`points_earned`) remains the lifetime-earn record. Deduction is atomic — a conditional
    `UPDATE userPoints SET total_points = total_points - cost WHERE total_points >= cost` (via a
    `sql` template tag); 0 rows updated → `409 INSUFFICIENT_POINTS`, so a balance can never go
    negative. Reward **tier** (`SMALL` ≤ 500 pts / `LARGE` > 500) is derived in the service, never
    stored. Reject refunds exactly once (guarded by the `WHERE status = 'pending'` transition).

### Date / timezone gotchas
23. **Node.js small-icu / Render.com date formatting** — `Intl.DateTimeFormat('en-CA', …)` is **unreliable on
    small-icu Node builds** (e.g. Render.com): the `en-CA` ISO layout isn't bundled, so it falls back to the
    `en` (US) `MM/DD/YYYY` form, producing an invalid `YYYY-MM-DD` string → PostgreSQL `::date` cast throws
    `date/time field value out of range` → 500 on all quest + dashboard endpoints. Fix: build the date from
    `Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Ho_Chi_Minh', year:'numeric', month:'2-digit',
    day:'2-digit' }).formatToParts()` and read the `year`/`month`/`day` parts by type — locale-pattern-
    independent, bundled in small-icu, and avoids re-parsing a non-ISO string through `new Date()`. Applied in
    `quest.service.ts:getVnDateString` and `dashboard.service.ts:getTodayInVn`.

---

## Migrations to date

`0000`–`0018` applied in order:

| # | Tag | What |
|---|---|---|
| 0000 | chief_toro | auth/users base |
| 0001 | thin_sebastian_shaw | user_metrics |
| 0002 | small_celestials | users expansion (array-default hand-patch) |
| 0003 | abnormal_lifeguard | food_logs |
| 0004 | faulty_toad_men | food_items + pg_trgm + trigram indexes |
| 0005 | fix_category_length | food_items.category varchar 128→255 |
| 0006 | food_logs_user_idx | composite (user_id, consumed_at) index *(hand-written)* |
| 0007 | outstanding_hex | payment (transactions, subscriptions) |
| 0008 | ordinary_newton_destine | workout (exercises, sessions, logs) |
| 0009 | last_zarda | PT Phase 1 (pt_verifications, pt_profiles) |
| 0010 | courses_enrollments | **PT P2** courses/modules/lessons/enrollments *(hand-written)* |
| 0011 | pt_assignments | **PT P3** pt_assignments *(hand-written)* |
| 0012 | pt_earnings_withdrawals | **PT P4** pt_earnings, withdrawals + backfill *(hand-written)* |
| 0013 | articles | **content** articles, article_categories + 5 seeded categories *(hand-written)* |
| 0014 | quest_system | **quest** quests (7 seeded), daily_mission_logs, user_points *(hand-written)* |
| 0015 | ai_food_scans | **scan** ai_food_scans *(hand-written)* |
| 0016 | reward_redemptions | **quest** rewards (5 seeded), reward_redemptions + redemption_status enum *(hand-written)* |
| 0017 | admin_user_management | **admin** users ban columns (`is_banned`, `ban_reason`, `banned_at`) *(hand-written)* |
| 0018 | lesson_cloudinary_video | **PT P2** course_lessons.cloudinary_video_url *(hand-written)* |

Run `npm run db:migrate` to apply; `npm run seed:foods` and `npm run seed:exercises`
to populate catalogs. (Quest catalog and article categories are seeded by their migrations,
not separate seed scripts.)
