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
- **External (installed, not yet wired):** `openai`
- **Seeding:** `csv-parse`
- **Tooling:** `nodemon`, `tsx`, `ts-node`, `eslint`, `prettier`

## Implemented modules

API base path: `/api/v1`. Full per-endpoint reference lives in [docs/API_CURRENT.md](docs/API_CURRENT.md).

| Module | Endpoints | Surface |
|---|---|---|
| **Auth** | 9 | register, login, refresh, logout, logout-all, verify-email, resend-verification, forgot-password, reset-password |
| **Users** | 7 | me (GET/PATCH/DELETE), onboarding, metrics, change-password, pt-assignments feed |
| **Nutrition** | 5 | food-logs (POST/GET/PATCH/DELETE), summary/daily |
| **Foods** | 3 | search, categories, get-by-id — backed by **~2,100 items** seeded from Vietnam NIN (Viện Dinh Dưỡng Việt Nam): 853 ingredients + 1,250 dishes |
| **Dashboard** | 1 | user home-screen aggregate (today's calories/macros, meal breakdown, streak, weight, goal) |
| **Payment** | 5 | checkout (PRO + PT_COURSE), PayOS webhook, transactions, subscription, purchased courses |
| **Workout** | 7 | exercises (list/detail), sessions (create/list/detail/update/delete) — backed by **40 seeded exercises** |
| **PT** | 18 | verification, profile, courses (CRUD + publish/archive), students (list/detail + meal-plan + exercise assignments), earnings, withdrawals |
| **Admin** | 7 | PT verifications (list/get/approve/reject), withdrawals (list/approve/reject) |
| **Content** | 2 | public discover + detail for published PT courses |

Plus `GET /health` (no auth, no envelope).

## Setup

Assumes PostgreSQL and Redis are already running and reachable from values in `.env`.

```bash
npm install
cp .env.example .env       # fill DB_*, REDIS_URL, JWT_SECRET, JWT_REFRESH_SECRET, RESEND_API_KEY, PAYOS_*
npm run db:migrate         # creates all tables + pg_trgm extension
npm run seed:foods         # ~2,100 rows into food_items (idempotent — safe to re-run)
npm run seed:exercises     # 40 rows into exercises (idempotent — safe to re-run)
npm run dev                # listens on PORT from .env (default 3000)
```

Boot-time required env (all Zod-validated; the app exits if any is missing/invalid):

- `JWT_SECRET` and `JWT_REFRESH_SECRET` — each ≥32 chars and different from each other.
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
| `npm run db:push` | Push schema directly to DB (dev shortcut; bypasses migration files) |
| `npm run seed:foods` | Import the Vietnam NIN food catalog into `food_items` |
| `npm run seed:exercises` | Import the exercise library into `exercises` |
| `npm run test:connection` | Smoke-test PostgreSQL + Redis connectivity |

## Planned modules

Not yet implemented:

- **Scan** — AI food scanning (OpenAI Vision)
- **Content** — articles (the `/content` router exists; only PT-course discovery endpoints are wired so far)

Deferred within shipped modules: live workout-session flow (start/log-set/finish), workout programs, subscription auto-renewal, the cron jobs that expire stale subscriptions, PT-course refunds (the `earnings_status='refunded'` state is defined but no endpoint flips it yet), automated bank transfers for withdrawals (admin currently records the bank reference manually), and the `on_hold → available` cron for PT earnings (computed inline on read instead).
