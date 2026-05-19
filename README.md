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
- **Security:** `helmet`, `cors`, `express-rate-limit`
- **HTTP logging:** `morgan`
- **Uploads:** `multer`
- **Dates:** `date-fns`
- **External (installed, not yet wired):** `openai`, `@payos/node`
- **Seeding:** `csv-parse`
- **Tooling:** `nodemon`, `tsx`, `ts-node`, `eslint`, `prettier`

## Implemented modules

API base path: `/api/v1`. Full per-endpoint reference lives in [docs/API_CURRENT.md](docs/API_CURRENT.md).

| Module | Endpoints | Surface |
|---|---|---|
| **Auth** | 9 | register, login, refresh, logout, logout-all, verify-email, resend-verification, forgot-password, reset-password |
| **Users** | 6 | me (GET/PATCH/DELETE), onboarding, metrics, change-password |
| **Nutrition** | 5 | food-logs (POST/GET/PATCH/DELETE), summary/daily |
| **Foods** | 3 | search, categories, get-by-id — backed by **~2,100 items** seeded from Vietnam NIN (Viện Dinh Dưỡng Việt Nam): 853 ingredients + 1,250 dishes |

Plus `GET /health` (no auth, no envelope).

## Setup

Assumes PostgreSQL and Redis are already running and reachable from values in `.env`.

```bash
npm install
cp .env.example .env       # fill DB_*, REDIS_URL, JWT_SECRET, JWT_REFRESH_SECRET, RESEND_API_KEY
npm run db:migrate         # creates all tables + pg_trgm extension
npm run seed:foods         # ~2,100 rows into food_items (idempotent — safe to re-run)
npm run dev                # listens on PORT from .env (default 3000)
```

`RESEND_API_KEY` is required at boot (Zod-validated). In dev you can set it to any non-empty placeholder — outgoing emails fail silently and the rest of the API still works.

`JWT_SECRET` and `JWT_REFRESH_SECRET` must each be ≥32 chars and different from each other. Generate with:

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
| `npm run test:connection` | Smoke-test PostgreSQL + Redis connectivity |

## Planned modules

Not yet implemented:

- **Scan** — AI food scanning (OpenAI Vision)
- **Workout** — Exercise library, sessions, programs
- **PT** — Personal-trainer marketplace (verification, students, courses, withdrawals)
- **Payment** — PayOS checkout + webhook
- **Dashboard** — Aggregated user / PT / admin views
