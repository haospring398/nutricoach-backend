# NutriCoach Backend

REST API for the NutriCoach mobile app (Vietnamese nutrition + fitness coaching). Express + TypeScript on PostgreSQL and Redis, organized in layer-based MVC (`models/`, `controllers/`, `services/`, `routes/`, `validations/`).

## Tech stack

- **Runtime:** Node.js ≥18, TypeScript 5.9
- **HTTP:** Express 4
- **DB:** PostgreSQL via `pg` + Drizzle ORM (`drizzle-orm` 0.29, `drizzle-kit` 0.20)
- **Cache & token store:** Redis via `ioredis`
- **Auth:** `jsonwebtoken` (HS256) + `bcrypt`
- **Validation:** Zod
- **Email:** Resend (`resend`)
- **Payments:** `@payos/node` (PayOS)
- **Security:** `helmet`, `cors`, `express-rate-limit`
- **HTTP logging:** `morgan`
- **Uploads:** `multer`
- **Dates:** `date-fns`
- **AI:** external Gemini microservice over HTTP (`AI_SERVICE_URL`); `openai` is installed but unused
- **Media:** Cloudinary (avatars, course thumbnails, lesson videos)
- **Seeding:** `csv-parse`
- **Tooling:** `nodemon`, `tsx`, `ts-node`, `eslint`, `prettier`

## Implemented modules

API base path: `/api/v1`. **106 endpoints** across 12 router mounts. The always-current surface is **Swagger `/api-docs`** (raw spec `/api-docs.json`); the full per-endpoint reference is [docs/API_CURRENT.md](docs/API_CURRENT.md) and the onboarding map is [docs/CODEBASE_CONTEXT.md](docs/CODEBASE_CONTEXT.md).

(Counts below are per router mount.)

| Module | Endpoints | Surface |
|---|---|---|
| **Auth** | 10 | register, login, refresh, logout, logout-all, **me**, verify-email, resend-verification, forgot-password, reset-password |
| **Users** | 9 | me (GET/PATCH/DELETE), onboarding, metrics (GET/PATCH), change-password, pt-assignments feed, **avatar upload** |
| **Nutrition** | 6 | food-logs (POST/GET/PATCH/DELETE), summary/daily, **meal-plans/generate (AI)** |
| **Foods** | 3 | search, categories, get-by-id — backed by **~2,100 items** seeded from Vietnam NIN (Viện Dinh Dưỡng Việt Nam): 853 ingredients + 1,250 dishes |
| **Dashboard** | 1 | user home-screen aggregate (today's calories/macros, meal breakdown, streak, weight, goal) |
| **Payment** | 5 | checkout (PRO + PT_COURSE), PayOS webhook, transactions, subscription, purchased courses |
| **Workout** | 7 | exercises (list/detail), sessions (create/list/detail/update/delete) — backed by **40 seeded exercises** |
| **PT** | 20 | verification, profile, courses (CRUD + publish/archive + **thumbnail/lesson-video upload**), students (list/detail + meal-plan + exercise assignments), earnings, withdrawals |
| **Content** | 5 | discover + detail for published PT courses, **articles (list/detail) + categories** |
| **Quests** | 7 | daily, trigger, diary-lock, points, rewards, redeem, redemptions (gamification) |
| **Scan** | 1 | AI food scan — image → external Gemini microservice → VN answer |
| **Admin** | 32 | PT review (verifications + withdrawals), article + category writes, quest/reward admin + leaderboard + redemption review, **user management** (list/ban/unban/role + growth analytics) |

Plus `GET /health` (no auth, no envelope). The `/admin` mount carries 32 handlers spanning PT review, content, quests, and user management — see [docs/CODEBASE_CONTEXT.md §3](docs/CODEBASE_CONTEXT.md) for the per-feature breakdown.

## Setup

Assumes PostgreSQL and Redis are already running and reachable from values in `.env`.

```bash
npm install
cp .env.example .env       # fill DB_*, REDIS_URL, JWT_SECRET, JWT_REFRESH_SECRET, RESEND_API_KEY, PAYOS_*, CLOUDINARY_*, AI_SERVICE_URL/SECRET
npm run db:migrate         # creates all tables + pg_trgm extension
npm run seed:foods         # ~2,100 rows into food_items (idempotent — safe to re-run)
npm run seed:exercises     # 40 rows into exercises (idempotent — safe to re-run)
npm run dev                # listens on PORT from .env (default 3000)
```

Boot-time required env (all Zod-validated; the app exits if any is missing/invalid):

- `JWT_SECRET` and `JWT_REFRESH_SECRET` — each ≥32 chars and different from each other.
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` — boot-required (`.min(1)` in the Zod schema): the app **crashes at startup** if any is missing (unlike PayOS, which fails lazily). Used for avatar / course-thumbnail / lesson-video uploads.
- `AI_SERVICE_URL`, `AI_SERVICE_SECRET` — boot-required: the food-scan + meal-plan features call an external Gemini microservice over HTTP. The backend still boots and runs if that service is down (per-request `503 AI_SERVICE_UNAVAILABLE`), but the URL/secret must be present at startup.
- `RESEND_API_KEY` — in dev, any non-empty placeholder works (outgoing emails fail silently).
- `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY` — the payment module's PayOS client throws at startup if any is absent. In dev, placeholder strings let the app boot (only live PayOS API calls fail).

Generate a JWT secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## npm scripts

| Script | Description |
|---|---|
| `npm run dev` | Start the dev server under nodemon + tsx (watches `src/`) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the built server (`node dist/server.js`) |
| `npm run db:migrate` | Apply pending SQL migrations from `src/db/migrations/` |
| `npm run db:generate` | Generate a new migration from a Drizzle schema diff |
| `npm run db:studio` | Open Drizzle Studio (DB GUI) |
| `npm run db:push` | ⚠️ **Do not use on this project** — it bypasses the hand-written partial-unique indexes + CHECK constraints in migrations `0010+`. Always use `db:migrate`. |
| `npm run seed:foods` | Import the Vietnam NIN food catalog into `food_items` |
| `npm run seed:exercises` | Import the exercise library into `exercises` |
| `npm run test:connection` | Smoke-test PostgreSQL + Redis connectivity |

## Planned / deferred

All 12 modules above are shipped — the PT marketplace is feature-complete (Phases 1–4). Deferred within shipped modules:

- live workout-session flow (start/log-set/finish) and workout programs
- subscription auto-renewal + the cron that expires stale subscriptions / downgrades `users.tier`
- PT-course refunds — `enrollment_status='refunded'` / `earnings_status='refunded'` are defined but no endpoint flips them yet
- automated bank transfers for withdrawals (admin records the transfer reference manually)
- the `on_hold → available` cron for PT earnings (computed inline on read instead)
- scan replay / thumbnail and a scan→food-log confirm flow (a scan stores only the image hash today)

> `openai` is an installed-but-unused dependency — the AI food-scan and meal-plan features call an **external Gemini microservice** over HTTP, not the OpenAI SDK.

## Documentation

- [docs/index.md](docs/index.md) — documentation index (start here)
- [docs/CODEBASE_CONTEXT.md](docs/CODEBASE_CONTEXT.md) — detailed onboarding map: folder layout, 27 tables, enum casing, conventions, Mermaid diagrams
- [docs/API_CURRENT.md](docs/API_CURRENT.md) — full per-endpoint API reference (live Swagger at `/api-docs`)
- [docs/architecture.md](docs/architecture.md) · [docs/data-models.md](docs/data-models.md) · [docs/source-tree-analysis.md](docs/source-tree-analysis.md)
- [docs/deployment-guide.md](docs/deployment-guide.md) — deploy (Neon) · [docs/NutriCoach_Mobile_Integration_Guide_VI.md](docs/NutriCoach_Mobile_Integration_Guide_VI.md) — mobile integration (VI)
