# Data Models — NutriCoach Backend

> Tài liệu schema cơ sở dữ liệu. Sinh tự động bởi workflow `bmad-document-project` (exhaustive scan, 2026-06-18).
> Nguồn chuẩn: các file `src/models/*.model.ts` (Drizzle table definitions) + migrations `src/db/migrations/0000–0020`.
> Tham khảo chi tiết bổ sung: [CODEBASE_CONTEXT.md §2 & §4](./CODEBASE_CONTEXT.md).

## Tổng quan

- **27 bảng** trên **13 file model**, re-export qua [models/index.ts](../src/models/index.ts).
- **Primary key:** mặc định `uuid('id').defaultRandom()`. Ngoại lệ slug-PK: `exercises`, `quests` (`varchar(64)`), và các bảng one-row-per-user dùng `userId` làm PK (`user_metrics`, `user_points`).
- **Soft delete:** chỉ `users.deletedAt` — query phải filter `isNull(users.deletedAt)`.
- **ORM:** Drizzle 0.29 / drizzle-kit 0.20. Partial unique index, CHECK constraint, GIN/trigram index **không biểu diễn được trong DSL** → nằm trong file migration `.sql` viết tay (xem ghi chú từng bảng).
- **Enum casing KHÔNG đồng nhất** — xem [CODEBASE_CONTEXT.md §4](./CODEBASE_CONTEXT.md). API luôn trả UPPERCASE; DB lưu lowercase cho nhóm enum mới hơn.

---

## Sơ đồ quan hệ (rút gọn)

```
users ─┬─< refresh_tokens
       ├─1─ user_metrics (PK=userId)
       ├─1─ user_points  (PK=userId)
       ├─< food_logs >── food_items (set null)
       ├─< workout_sessions ─< session_exercise_logs >── exercises
       ├─< ai_food_scans
       ├─< daily_mission_logs >── quests
       ├─< reward_redemptions >── rewards
       ├─< transactions ─1─ subscriptions
       │        └─< enrollments >── courses ─< course_modules ─< course_lessons
       │                  │            └── pt_id → users
       │                  ├─< pt_assignments
       │                  └─< pt_earnings ─ withdrawals (qua pt_id)
       ├─1─ pt_profiles
       └─< pt_verifications
articles >── article_categories, authorId → users
```

---

## Core / Auth — [user.model.ts](../src/models/user.model.ts)

### `users`
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | uuid PK | |
| email | varchar(255) unique notNull | |
| password | varchar(255) notNull | bcrypt cost 12 |
| fullName | varchar(255) notNull | |
| phone | varchar(20) | nullable |
| avatarUrl | text | Cloudinary URL |
| role | `user_role` notNull default `user` | enum: user/pt/admin |
| tier | `user_tier` notNull default `FREE` | enum: FREE/PRO |
| emailVerified | boolean default false | |
| onboardingCompleted | boolean default false | |
| preferredLanguage | varchar(10) default `vi` | |
| createdAt / updatedAt | timestamp | |
| deletedAt | timestamp | **soft delete** |
| isBanned | boolean default false | migration 0017 |
| banReason | text | migration 0017 |
| bannedAt | timestamptz | migration 0017 |

### `refresh_tokens`
`id` · `userId` → users (cascade) · `token` varchar(512) unique · `expiresAt` · `createdAt`.

---

## Onboarding metrics — [user-metrics.model.ts](../src/models/user-metrics.model.ts)

### `user_metrics` (PK = `userId`)
`gender` (MALE/FEMALE) · `dateOfBirth` date · `heightCm` int · `weightKg` numeric(5,2) · `activityLevel` (SEDENTARY/LIGHT/MODERATE/ACTIVE/VERY_ACTIVE) · `goal` (LOSE_WEIGHT/MAINTAIN/GAIN_WEIGHT/GAIN_MUSCLE) · `targetWeightKg?` · `dietaryRestrictions` text[] · `allergies` text[] · `bmr`/`tdee`/`dailyCalorieTarget`/`proteinG`/`carbsG`/`fatG` int (mục tiêu tính tại onboarding) · `updatedAt`.

---

## Nutrition — [food-item.model.ts](../src/models/food-item.model.ts) · [food-log.model.ts](../src/models/food-log.model.ts)

### `food_items` (catalog VN NIN, seeded ~2,100 dòng)
`id` · `externalId` varchar(32) unique · `source` (default `VN_NIN`) · `type` (INGREDIENT/DISH) · `nameVi` · `nameEn?` · `category` · `caloriesKcal` numeric(7,2) · các macro/khoáng/vitamin (`proteinG?` … `vitaminAIu?`) · `micronutrients?` jsonb · `dataCompleteness` (FULL/PARTIAL/CALORIES_ONLY) · `isVerified` default true · `createdAt`.

### `food_logs`
`id` · `userId` → users (cascade) · `foodItemId?` → food_items (**set null**) · `foodName` varchar(200) · `calories` **integer** · `proteinG?`/`carbsG?`/`fatG?` numeric(6,2) **nullable** · `portion` numeric(4,2) (hệ số nhân) · `mealType` (BREAKFAST/LUNCH/DINNER/SNACK) · `consumedAt` **timestamp WITHOUT tz** · `sourceType` (MANUAL/SCAN) · `scanId?` · `createdAt`.
Index: `food_logs_user_consumed_idx (userId, consumedAt)`.

---

## Payment — [payment.model.ts](../src/models/payment.model.ts)

### `transactions`
`id` · `userId` → users (restrict) · `orderCode` **bigint** unique · `productType` (pro_monthly/pro_yearly/pt_course) · `productRefId?` (chứa course UUID khi `pt_course`) · `amountVnd` int · `status` (pending/paid/failed/expired/cancelled) · `paymentLinkId?`/`checkoutUrl?`/`reference?` · `paidAt?`/`expiresAt?` · `failureReason?` · `rawWebhookPayload?` jsonb · timestamps.

### `subscriptions`
`id` · `userId` → users (cascade) · `plan` (product_type) · `status` (active/expired/cancelled) · `startedAt`/`expiresAt` · `autoRenew` default false · `lastTransactionId?` → transactions · timestamps.
**Partial unique** (một ACTIVE subscription / user) + CHECK plan → trong migration SQL.

---

## Workout — [workout.model.ts](../src/models/workout.model.ts)

### `exercises` (seeded, slug PK)
`id` **varchar(64) slug** (vd `ex_pushup_standard`) · `nameVi`/`nameEn` · `muscleGroups` **muscle_group[]** · `equipment` · `difficulty` · `caloriesPerMinute` numeric · `thumbnailUrl?`/`animation2dUrl?`/`youtubeVideoId?` · `instructions?`/`commonMistakes?`/`variations?` jsonb · timestamps.
GIN index trên `muscle_groups` + trigram trên tên → migration SQL.

### `workout_sessions`
`id` · `userId` → users (cascade) · `name` · `performedAt` · `durationSec`/`estimatedCaloriesBurned`/`caloriesBurned` int · `notes?` · timestamps. Index `(userId, performedAt)`.

### `session_exercise_logs` (một dòng / set hoặc cardio block)
`id` · `sessionId` → workout_sessions (cascade) · `exerciseId` → exercises (restrict) · `exerciseNameSnapshot` · `orderIndex`/`setNumber` · `reps?`/`weightKg?`/`durationSec?`/`restSec`/`rpe?` · `notes?` · `createdAt`. Index `(sessionId)`.

---

## PT — verification & profile — [pt.model.ts](../src/models/pt.model.ts)

### `pt_verifications` (đơn đăng ký, không bao giờ xóa)
`id` · `userId` → users (cascade) · `fullName`/`dateOfBirth`/`citizenIdNumber` · `citizenIdFrontKey`/`citizenIdBackKey` varchar(256) (file key opaque) · `certificates` jsonb `CertificateEntry[]` · `specialties` text[] · `yearsOfExperience` · `bio` · `bankCode`/`bankAccountNumber`/`bankAccountHolder` · `status` (pending_review/approved/rejected) · `reviewedByAdminId?` · `reviewedAt?`/`reviewNote?`/`requireResubmit?` · `submittedAt` · timestamps.
**Partial unique** (tối đa 1 `pending_review` / user) → migration SQL.

### `pt_profiles` (dữ liệu PT đã duyệt, một dòng / PT)
`id` · `userId` → users (cascade, **unique**) · `bio`/`specialties`/`yearsOfExperience` · bank fields · `commissionPercent` int default 10 (PT nhận `100 - commissionPercent`%) · `approvedFromVerificationId?` · timestamps.

---

## PT — courses & enrollments — [course.model.ts](../src/models/course.model.ts)

### `courses`
`id` · `ptId` → users (restrict) · `title` varchar(200) · `description` text · `thumbnailUrl?` · `thumbnailPublicId?` varchar(512) (**migration 0019** — Cloudinary public_id để replace/cleanup destroy asset cũ theo id, không parse URL) · `priceVnd` int · `durationDays` int · `tags` text[] · `status` (draft/published/archived, default draft) · `publishedAt?`/`archivedAt?` · `totalLessons` int (**đếm denormalized do service duy trì**) · timestamps.
CHECK (migration): price 50k–50M, duration 1–365, `char_length(trim(title)) ≥ 3`. Trigram GIN trên title.

### `course_modules`
`id` · `courseId` → courses (cascade) · `title` · `displayOrder` · timestamps. **UNIQUE (course_id, display_order)**.

### `course_lessons`
`id` · `moduleId` → course_modules (cascade) · `title` · `youtubeVideoId?` varchar(32) · `cloudinaryVideoUrl?` varchar(512) (migration 0018) · `cloudinaryVideoPublicId?` varchar(512) (**migration 0019** — public_id của video để compensating-delete/replace cleanup) · `isPreview` boolean default false (**migration 0020** — true: lesson cho xem thử công khai, public catalog lộ `cloudinaryVideoUrl`; false: paid) · `durationMin` int default 0 · `displayOrder` · timestamps. **UNIQUE (module_id, display_order)**.
> Lesson publishable nếu có **một trong hai**: `youtubeVideoId` hoặc `cloudinaryVideoUrl`.

### `enrollments` (webhook payment ghi vào)
`id` · `userId` → users (cascade) · `courseId` → courses (restrict) · `ptId` → users (restrict, denormalized) · `transactionId` → transactions (restrict) · `status` (active/completed/refunded) · `enrolledAt`/`completedAt?` · timestamps.
**UNIQUE (transaction_id)** (idempotency webhook). Partial unique `(user_id, course_id) WHERE status != 'refunded'`.

---

## PT — assignments — [pt-assignment.model.ts](../src/models/pt-assignment.model.ts)

### `pt_assignments`
`id` · `ptId` → users (restrict) · `studentId` → users (cascade) · `enrollmentId` → enrollments (cascade) · `type` (meal_plan/exercise_addition) · `payload` jsonb (shape theo type, validate ở Zod) · `supersededBy?` uuid (**self-pointer, cố ý KHÔNG là FK**) · `acknowledgedAt?` (reserved) · `scheduledFor?` date · `note?` · timestamps.
CHECK `jsonb_typeof(payload)='object'`. Partial unique "một meal_plan active / enrollment" → migration SQL.

---

## PT — earnings & withdrawals — [pt-earnings.model.ts](../src/models/pt-earnings.model.ts)

### `pt_earnings` (sổ cái thu nhập chuẩn, không phải cache)
`id` · `ptId` → users (restrict) · `transactionId`/`courseId`/`enrollmentId` (restrict) · `grossVnd`/`platformFeeVnd`/`netVnd` int · `commissionPercentSnapshot` int (**bất biến, chốt tại payment**) · `status` (on_hold/available/refunded/paid_out, default on_hold) · `availableAt` (= paid_at + 7 ngày) · timestamps.
**UNIQUE (transaction_id)**. CHECK: `net = gross - fee` & ≥ 0; commission 0–50. Chuyển `on_hold → available` **tính trên read** (CASE), không có cron.

### `withdrawals`
`id` · `ptId` → users (restrict) · `amountVnd` int · `bankCode`/`bankAccountNumber`/`bankAccountHolder` (**snapshot tại lúc request**) · `status` (pending_approval/completed/rejected) · `idempotencyKey` varchar(64) · `note?` · `requestedAt` · `reviewedByAdminId?`/`reviewedAt?`/`transferReference?`/`rejectionReason?` · timestamps.
**UNIQUE (pt_id, idempotency_key)**. CHECK `amount_vnd ≥ 200000 AND amount_vnd % 1000 = 0`.

---

## Content — [content.model.ts](../src/models/content.model.ts)

### `articles`
`id` · `slug` varchar(280) unique (server-gen, **bất biến**) · `title` · `excerpt` varchar(300) · `body` text (**Markdown thô, không render server-side**) · `categoryId` → article_categories (restrict) · `authorId` → users (restrict, admin) · `coverImageUrl?` · `tags` text[] · `readingTimeMin` int (**server tính 200 wpm**) · `viewCount` int · `status` (draft/published/archived) · `publishedAt?`/`archivedAt?` · timestamps.
CHECK: title ≥ 3, excerpt ≥ 20, body ≥ 50. Index `(status, published_at DESC)`, trigram GIN title, GIN tags.

### `article_categories` (seeded 5 dòng)
`id` · `slug` varchar(64) unique · `name` varchar(100) (tiếng Việt) · `displayOrder` int · `createdAt`.

---

## Gamification — [quest.model.ts](../src/models/quest.model.ts)

### `quests` (seeded 7 dòng, slug PK)
`id` **varchar(64) slug** (vd `DAILY_LOGIN`) · `title`/`description` · `pointsPerCompletion` int · `maxCompletionsPerDay` int default 1 · `isActive` default true · timestamps.
Seed: DAILY_LOGIN, AI_SCAN, PERFECT_DIARY, DISCIPLINE_MASTER, WORKOUT_DONE, PT_VISIT, DAILY_SHARE.

### `daily_mission_logs` (một dòng / user / quest / ngày VN)
`id` · `userId` → users (cascade) · `questId` → quests (restrict) · `date` date (lịch VN) · `completedCount` int · `pointsEarned` int · `referenceId?` (dedup/audit) · `createdAt`.
**UNIQUE (user_id, quest_id, date)**.

### `user_points` (PK = userId)
`totalPoints` int default 0 · `updatedAt`. **Từ migration 0016 là số dư spendable, không phải lifetime earned.** Tách khỏi `users` để write gamification không chạm auth hot-path.

### `rewards` (seeded 5 dòng)
`id` · `name`/`description` · `pointsRequired` int (CHECK > 0) · `isActive` · timestamps (timestamptz).
Tier SMALL (≤ 500) / LARGE (> 500) **derive trong service, không lưu DB** (`SMALL_REWARD_MAX_POINTS = 500`).

### `reward_redemptions`
`id` · `userId` (cascade) · `rewardId` → rewards (restrict) · `rewardName`/`pointsCost`/`deliveryAddress`/`phone` (**snapshot**) · `status` (pending/fulfilled/rejected) · `voucherCode?` (SMALL only) · `adminNote?` · `redeemedAt` (timestamptz) · `fulfilledAt?` · `fulfilledByAdminId?` · index `(user_id, redeemed_at DESC)`, `(status, redeemed_at DESC)`.

---

## AI food scan — [ai-food-scan.model.ts](../src/models/ai-food-scan.model.ts)

### `ai_food_scans`
`id` · `userId` → users (cascade) · `imageHash` varchar(64) (**SHA-256 hex; KHÔNG bao giờ lưu base64 thô**) · `extraction` jsonb · `matchedRows` jsonb default `[]` · `finalAnswer?` text · `createdAt` (timestamptz). Index `(userId, createdAt)`, `(userId, imageHash)`.
Row id trở thành `referenceId` server-verified cho quest AI_SCAN.

---

## Migrations

21 file SQL `0000_*` → `0020_*` trong [src/db/migrations/](../src/db/migrations/) + `meta/` (drizzle journal + snapshots).

| Migration | Nội dung |
|---|---|
| 0000–0009 | core, auth, user_metrics, food_items/logs, payment, workout, pt verification, indexes |
| 0010 | courses + enrollments |
| 0011 | pt_assignments |
| 0012 | pt_earnings + withdrawals |
| 0013 | articles + article_categories |
| 0014 | quest system (quests, daily_mission_logs, user_points) |
| 0015 | ai_food_scans |
| 0016 | reward redemption (rewards, reward_redemptions) |
| 0017 | admin user management (ban columns) |
| 0018 | lesson cloudinary video (course_lessons.cloudinary_video_url) |
| 0019 | course media public_id (courses.thumbnail_public_id + course_lessons.cloudinary_video_public_id) — replace cleanup + compensating delete |
| 0020 | course_lessons.is_preview (bool default false) — cờ xem thử công khai per-lesson |

> ⚠️ **Quy tắc migration:** migration thường → `npm run db:generate` + `npm run db:migrate`. Migration viết tay (0010+) áp bằng `psql -f` trực tiếp (drizzle journal hash bị corrupt với file viết tay). Không dùng `db:push` trên production. Xem [project-context.md](../_bmad-output/project-context.md).
