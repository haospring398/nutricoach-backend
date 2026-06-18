# Source Tree Analysis — NutriCoach Backend

> Cây thư mục có chú thích. Sinh bởi `bmad-document-project` (exhaustive scan, 2026-06-18).
> Repository type: **monolith** (single part, backend REST API).

## Cây thư mục gốc

```
nutricoach-backend/
├── src/                     # Toàn bộ source TypeScript (95 file, ~20k LOC)
├── data/seed/               # Dữ liệu seed: vn_food.csv, vn_dishes.csv, exercises.json
├── docs/                    # Tài liệu (file này + các doc khác)
├── design-artifacts/        # Tài liệu thiết kế UX/asset
├── _bmad/ · _bmad-output/   # BMad Method config + output (project-context.md)
├── docker-compose.yml       # Postgres + Redis cho dev local
├── drizzle.config.ts        # Cấu hình drizzle-kit (generate/migrate/studio)
├── nodemon.json             # Watch config cho `npm run dev`
├── tsconfig.json            # strict:true, target ES2022, module commonjs, no path alias
├── .env / .env.example      # Biến môi trường (Zod-validated tại boot)
└── package.json             # Scripts + dependencies
```

## `src/` — chi tiết theo layer

```
src/
├── app.ts                   # ⭐ Express app: helmet, cors, json (+ rawBody verify cho
│                            #   PayOS webhook), morgan, /health, Swagger UI (/api-docs),
│                            #   mount /api/v1
├── server.ts                # ⭐ Entry point: check DB+Redis → app.listen → graceful shutdown
│
├── config/                  # Singletons khởi tạo tại boot
│   ├── env.ts               # ⭐ Zod-validated env. NƠI DUY NHẤT đọc process.env. Exit nếu lỗi
│   ├── db.ts                # Drizzle client trên node-postgres Pool (max 5). export `db`, `pool`
│   ├── redis.ts             # ioredis client + `cache` helper (get/set/del/exists JSON)
│   ├── cloudinary.ts        # Cloudinary SDK singleton (boot-required)
│   └── swagger.ts           # swagger-jsdoc OpenAPI 3.0 spec; glob @openapi trong routes/*.ts
│
├── models/                  # Drizzle table definitions (một file / domain)
│   ├── index.ts             # Barrel: re-export mọi model = Drizzle `schema` object
│   ├── user.model.ts        # users, refresh_tokens
│   ├── user-metrics.model.ts# user_metrics
│   ├── food-item.model.ts   # food_items
│   ├── food-log.model.ts    # food_logs
│   ├── payment.model.ts     # transactions, subscriptions
│   ├── workout.model.ts     # exercises, workout_sessions, session_exercise_logs
│   ├── pt.model.ts          # pt_verifications, pt_profiles
│   ├── course.model.ts      # courses, course_modules, course_lessons, enrollments
│   ├── pt-assignment.model.ts # pt_assignments
│   ├── pt-earnings.model.ts # pt_earnings, withdrawals
│   ├── content.model.ts     # articles, article_categories
│   ├── quest.model.ts       # quests, daily_mission_logs, user_points, rewards, reward_redemptions
│   └── ai-food-scan.model.ts# ai_food_scans
│
├── controllers/             # HTTP layer: parse req → gọi service → envelope response
│                            # (verb+noun camelCase, KHÔNG suffix Handler; có handleError local)
│   ├── auth · users · nutrition · foods · dashboard · payment · workout
│   ├── pt · pt-students · pt-earnings · course · content · quest · scan
│   └── admin.controller.ts  # PT review + user management + analytics
│
├── services/                # ⭐ Business logic; KHÔNG import Request/Response; gọi db/redis
│   ├── auth · users · nutrition · foods · dashboard · payment · workout
│   ├── pt · pt-students · pt-earnings · course · content · quest · scan (.service.ts)
│   └── payment/
│       ├── payos.client.ts  # PayOS SDK singleton (throw tại boot nếu thiếu creds)
│       └── plans.ts         # Bảng giá PRO_PLANS hardcode
│
├── routes/                  # Express routers (một file / module) — mang @openapi JSDoc
│   ├── index.ts             # Aggregator: mount mọi module dưới /api/v1
│   ├── auth · users · nutrition · foods · dashboard · payment · workout
│   ├── pt · admin · content · quest · scan (.routes.ts)
│   │  (admin.routes.ts mang thêm /admin/articles, /admin/categories, /admin/quests)
│
├── validations/             # Zod schema (một file / module, suffix .validation.ts)
│                            # Parse tại controller: schema.parse(req.body)
│
├── middlewares/
│   ├── auth.middleware.ts   # ⭐ authenticate — verify JWT, load user row, reject soft-deleted/banned
│   ├── role.middleware.ts   # requireRole(...roles) — 403 guard sau authenticate
│   ├── pt-access.middleware.ts # requirePtAccessToStudent — 404-not-403 enrollment gate
│   └── upload.middleware.ts # uploadSingle/uploadVideoSingle — multer memoryStorage, stash err
│
├── lib/                     # Tiện ích dùng chung
│   ├── api-error.ts         # ApiError(status, code, message) base class
│   ├── auth-tokens.ts       # Redis-backed email-verify / password-reset tokens
│   ├── email.ts             # Resend wrapper (silent-fail) + transactional senders
│   ├── hash.ts              # bcrypt hash/compare (cost 12)
│   ├── jwt.ts               # access/refresh sign + verify (HS256)
│   ├── slug.ts              # slugify (strip dấu tiếng Việt + random suffix) + reading-time
│   └── user-presenter.ts    # role/tier lowercase-DB → uppercase-API mappers
│
├── db/
│   ├── migrate.ts           # Migration runner (npm run db:migrate)
│   ├── migrations/          # 0000–0019 .sql + meta/ (journal + snapshots)
│   └── seeds/
│       ├── foods.seed.ts    # CSV → food_items (npm run seed:foods)
│       └── exercises.seed.ts# JSON → exercises (npm run seed:exercises)
│
└── types/
    └── express.d.ts         # Augment Express Request: user, rawBody, enrollment, uploadError
```

⭐ = entry point / file then chốt.

## Điểm vào (entry points)

| Mục đích | File |
|---|---|
| Khởi động server | [src/server.ts](../src/server.ts) → [src/app.ts](../src/app.ts) |
| Cấu hình môi trường | [src/config/env.ts](../src/config/env.ts) (đọc duy nhất) |
| Bảng route gốc | [src/routes/index.ts](../src/routes/index.ts) → mount `/api/v1/*` |
| Schema DB | [src/models/index.ts](../src/models/index.ts) |
| Migration runner | [src/db/migrate.ts](../src/db/migrate.ts) |

## Quy ước tổ chức (xem [project-context.md](../_bmad-output/project-context.md))

- **Layer strict:** `routes → controllers → services → models`. Controller không gọi `db` trực tiếp; service không import `Request`/`Response`.
- **Không barrel export** ngoại trừ `models/index.ts`.
- **Không global error middleware** — mỗi controller có `handleError(res, err)` local.
- **Naming:** file `kebab-case.type.ts`; controller/service `verbNoun` camelCase; DB column `snake_case`; TS property `camelCase`; error code `SCREAMING_SNAKE_CASE`.
