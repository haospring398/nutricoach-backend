# Architecture — NutriCoach Backend

> Sinh bởi `bmad-document-project` (exhaustive scan, 2026-06-18). Nguồn chuẩn bổ sung: [CODEBASE_CONTEXT.md](./CODEBASE_CONTEXT.md) và [project-context.md](../_bmad-output/project-context.md).

## 1. Executive Summary

NutriCoach là **REST API backend** cho ứng dụng mobile dinh dưỡng + thể hình tại Việt Nam. Hệ thống cung cấp: auth/onboarding, nhật ký ăn uống (manual + AI scan), thư viện bài tập + nhật ký tập, gamification (quest + điểm + đổi thưởng), thanh toán PRO subscription, và **marketplace PT (personal trainer) hoàn chỉnh** (verification → courses → enrollment → student management → earnings/withdrawals).

- **Kiểu repo:** monolith (single part).
- **Loại:** backend service (Express REST API), tách riêng một AI microservice (Gemini/LangGraph) gọi qua HTTP.
- **Trạng thái:** PT marketplace feature-complete (Phase 1–4 đã ship); admin user-management + PT media upload mới nhất (migration 0017–0018).

## 2. Technology Stack

| Category | Technology | Version | Vai trò |
|---|---|---|---|
| Runtime | Node.js | ≥18 | |
| Language | TypeScript | 5.9 (strict, ES2022, commonjs) | Không path alias → relative imports |
| Web framework | Express | 4.22 | Middleware pipeline |
| Database | PostgreSQL + Drizzle ORM | 0.29.5 / drizzle-kit 0.20.18 | Type-safe, `$inferSelect` |
| Cache/Token | Redis (ioredis) | 5.3 | Refresh token, rate limit, email/reset token, idempotency cache |
| Validation | Zod | 3.25 | Schema tại `validations/`, parse ở controller |
| Auth | jsonwebtoken (HS256) + bcrypt | 9.0 / 5.1 | Access + refresh token; cost 12 |
| Payment | PayOS | 1.0.6 | Webhook verify từ rawBody |
| Media | Cloudinary | 2.10 | Avatar, course thumbnail, lesson video |
| Email | Resend | 6.12 | Transactional (silent-fail) |
| Upload | multer | 1.4.5-lts | memoryStorage, MIME whitelist |
| API docs | swagger-jsdoc + swagger-ui-express | 6.3 / 5.0 | `@openapi` JSDoc trong routes |
| AI | Google Gemini 2.5 Flash | — | **Microservice riêng** (LangGraph/ESM, port 4000), gọi HTTP |

## 3. Architecture Pattern — Layer-based MVC

```
HTTP request
  → routes/*.routes.ts        (Express router + @openapi JSDoc + middleware chain)
    → middlewares              (authenticate → requireRole → requirePtAccessToStudent)
      → controllers/*          (parse req, schema.parse(req.body), gọi service, envelope)
        → services/*           (business logic; gọi db/redis; throw ApiError subclass)
          → models/*           (Drizzle table definitions + inferred types)
```

**Nguyên tắc layer (strict):**
- Controller **không** gọi `db` trực tiếp; **không** chứa business logic phức tạp.
- Service **không** import `Request`/`Response`; là nơi duy nhất chạm `db`/`redis`.
- Model chỉ là Drizzle table + inferred type (`typeof t.$inferSelect`).

## 4. Conventions then chốt

### Response envelope (bắt buộc)
- Success `{ success:true, data }`; List `{ success:true, data:[], pagination }`; Error `{ success:false, error:{ code, message } }`.
- `204` không body. Ngoại lệ: PayOS webhook `{ received:true, ... }`.

### Error handling — KHÔNG có global error middleware
Mỗi controller có `sendSuccess`/`sendError`/`handleError` **local**. `handleError` map: `ZodError → 400 VALIDATION_ERROR`, `ApiError` subclass → status/code/message của nó, còn lại → `500 INTERNAL_ERROR`. Domain errors throw qua subclass (`AuthError`, `UserError`, `NutritionError`, `PaymentError`, `PtError`, `CourseError`, `QuestError`, …).
Middleware (auth/role/pt-access) **respond trực tiếp** thay vì throw. Ngoại lệ: `uploadSingle` (multer) **stash** lỗi vào `req.uploadError` để controller convert.

### Enum casing — KHÔNG đồng nhất
API luôn UPPERCASE. DB lưu lowercase cho nhóm enum mới (`user_role`, `transaction_status`, `course_status`, …) → convert qua [user-presenter.ts](../src/lib/user-presenter.ts) hoặc inline `toApiEnum`/`toDbEnum`. Nhóm cũ (`gender`, `goal`, `food_type`, `meal_type`, …) lưu UPPERCASE, không convert. Chi tiết: [data-models.md](./data-models.md) + [CODEBASE_CONTEXT.md §4](./CODEBASE_CONTEXT.md).

### Env & access
- Đọc env **chỉ** qua `import { env } from './config/env'` (Zod-validated, exit nếu lỗi). Không `process.env` ở nơi khác.
- DB chỉ qua `import { db } from './config/db'`; Redis qua `redis`/`cache`.
- **Drizzle only** — không raw `pool.query()`. Raw SQL chỉ trong migration `.sql` + `sql\`...\`` tag (similarity, ANY, FILTER, date_trunc, AT TIME ZONE).

## 5. Security & Auth flow

- `authenticate` (mọi route bảo vệ): verify HS256 JWT → load user row → reject soft-deleted (`401 ACCOUNT_DELETED`) / banned (`401 ACCOUNT_BANNED`) → set `req.user = { id, email, role }`.
- Router-level auth: `router.use(authenticate)` **một lần** cho cả router (không per-route → tránh double DB lookup).
- `requireRole('pt'|'admin')` chạy sau authenticate. `requirePtAccessToStudent` trả **404 cho mọi failure** (chống PT dò sự tồn tại user khác).
- Refresh token lưu DB (`refresh_tokens`) + dùng Redis; password reset / email verify token Redis-backed ([auth-tokens.ts](../src/lib/auth-tokens.ts)).
- Rate limiting: `express-rate-limit` mount tại app.ts.
- PayOS webhook: verify signature từ `req.rawBody` (raw bytes, không phải parsed JSON) — verify callback set trong [app.ts](../src/app.ts).
- Upload: multer memoryStorage 5MB ảnh (avatar) / 100MB MP4 (video lesson), MIME whitelist, lưu Cloudinary.

## 6. Tích hợp ngoài

| Service | Cách gọi | Failure mode |
|---|---|---|
| AI microservice (Gemini) | HTTP `env.AI_SERVICE_URL` + header `x-service-secret` | 503 `AI_SERVICE_UNAVAILABLE` |
| PayOS | SDK singleton (lazy, throw nếu thiếu creds khi gọi) | webhook luôn return 200 |
| Cloudinary | SDK singleton (**boot-required** — crash nếu thiếu creds) | |
| Resend (email) | wrapper silent-fail | không chặn luồng chính |

### Payment webhook (luồng quan trọng) — [payment.service.ts](../src/services/payment.service.ts) `handlePayosWebhook`
Trên event `PAID` đã verify, trong **một DB transaction**, branch theo `productType`:
- `pro_monthly`/`pro_yearly` → `activateProSubscription` (extend/insert subscription, set `users.tier = PRO`).
- `pt_course` → `activateCourseEnrollment`: insert `enrollments` (idempotent trên `transaction_id`) **+** `recordPtEarning` (snapshot commission, `available_at = paid_at + 7d`, `status = on_hold`). Course/PT thiếu → log + skip (vẫn return 200).

## 7. Idempotency

`POST /payment/checkout` và `POST /pt/withdrawals` nhận header `Idempotency-Key`: cache response Redis (24h TTL) + DB unique constraint làm safety net. First call → 201, replay → 200.

## 8. Migrations & seed

21 migration `0000–0020`. Migration thường: `db:generate` + `db:migrate` (journaled). Migration viết tay ngoài journal (0019+): đặt file `.sql` vào folder rồi `db:migrate` — manual-SQL pass tự áp file chưa chạy (tracked trong `_manual_migrations`); viết idempotent (`IF NOT EXISTS`), **không còn cần `psql -f`**. Không `db:push` production. Seed: `seed:foods` (~2,100 món NIN từ CSV), `seed:exercises` (~40 bài từ JSON). Xem [deployment-guide.md](./deployment-guide.md).

## 9. Testing strategy

**Chưa có test framework** (không Jest/Vitest). "Test suite" hiện tại = **curl smoke tests** sau mỗi module. Khi thêm formal test: dùng **Vitest** (ESM-friendly), file cạnh source `*.service.test.ts`, integration test dùng DB thật (không mock Drizzle).

## 10. Liên kết

- [project-overview.md](./project-overview.md) · [data-models.md](./data-models.md) · [api-contracts.md](./api-contracts.md) · [source-tree-analysis.md](./source-tree-analysis.md) · [development-guide.md](./development-guide.md) · [deployment-guide.md](./deployment-guide.md)
- Tài liệu hiện có: [CODEBASE_CONTEXT.md](./CODEBASE_CONTEXT.md) · [API_CURRENT.md](./API_CURRENT.md) · [NutriCoach_Mobile_Integration_Guide_VI.md](./NutriCoach_Mobile_Integration_Guide_VI.md)
