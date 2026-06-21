# Deployment Guide — NutriCoach Backend

> Sinh bởi `bmad-document-project` (2026-06-18). Tài liệu này tóm tắt; bản gốc chi tiết Neon: [DEPLOYMENT.md](./DEPLOYMENT.md) (đã đồng bộ 2026-06-18).

## Hạ tầng yêu cầu

| Thành phần | Yêu cầu |
|---|---|
| Node.js / npm | ≥ 18 / ≥ 9 |
| PostgreSQL | Neon serverless (hoặc Postgres tự host) |
| Redis | instance riêng (Upstash / Railway / self-host) — **bắt buộc** |
| Cloudinary | **boot-required** (avatar, thumbnail, video) |
| Resend | email transactional |
| PayOS | merchant account (payment) |
| AI microservice | URL + secret (food scan, meal-plan) |

## Thứ tự deploy

```bash
npm install
# → tạo .env đầy đủ (xem development-guide.md + DEPLOYMENT.md §4)
npm run build
npm run db:migrate          # tạo toàn bộ bảng (migrations 0000–0020)
npm run seed:foods          # ~2,100 food items (VN NIN)
npm run seed:exercises      # ~40 exercises
npm start
curl https://<host>/health  # { "status": "ok", ... }
```

## Lưu ý nhanh (đã đồng bộ vào DEPLOYMENT.md 2026-06-18)

- **27 bảng**, migrations **0000–0020** (trước đây DEPLOYMENT.md ghi nhầm 24 bảng / 0000–0014).
- Seed dùng **`npm run seed:foods`** + **`npm run seed:exercises`** riêng (không có `db:seed`).
- Biến email đúng là **`EMAIL_FROM`** (không phải `RESEND_FROM_EMAIL`) — xem [env.ts](../src/config/env.ts).

## Gotchas quan trọng (từ DEPLOYMENT.md, vẫn đúng)

- 🔴 **Cloudinary boot-required:** thiếu 1 trong 3 `CLOUDINARY_*` → server crash khi start (khác PayOS lazy-load). `AI_SERVICE_URL`/`AI_SERVICE_SECRET` cũng boot-required.
- 🔴 **JWT secrets phải khác nhau** và mỗi cái ≥ 32 ký tự (env.ts exit nếu trùng).
- 🔴 **Redis bắt buộc:** refresh token, rate limit, email verify, idempotency cache.
- 🟡 **Neon free tier:** max 10 connections — pool đã set `max: 5`, **không tăng**.
- 🟡 **Neon cold start:** suspend sau 5 phút → request đầu mất 5–10s (pool `connectionTimeoutMillis: 15s` xử lý).
- 🟡 **`DB_SSL=true` bắt buộc với Neon** (set `false` chỉ khi local Postgres).

## ⚠️ Quy tắc migration (cập nhật 2026-06-21 — xem [project-context.md](../_bmad-output/project-context.md))

- Migration thường (drizzle-kit sinh): `npm run db:generate` → `npm run db:migrate` (nằm trong `meta/_journal.json`).
- **Migration viết tay (ngoài journal, 0019 trở đi)**: đặt file `.sql` vào `src/db/migrations/` rồi `npm run db:migrate` — **manual-SQL pass** của runner tự áp mọi file chưa chạy, theo dõi trong bảng `_manual_migrations` (mỗi file 1 transaction). **Không còn cần `psql -f`.** Viết SQL idempotent (`ADD COLUMN IF NOT EXISTS`).
- **Không bao giờ `db:push` trên production** (bỏ qua partial unique index + CHECK constraints).
- `db:migrate` an toàn khi chạy lại (idempotent) — khuyến nghị gắn vào Build Command của Render: `npm install && npm run build && npm run db:migrate`.

## CI/CD

Chưa phát hiện pipeline CI/CD (`.github/workflows`, `.gitlab-ci.yml`, …) trong repo. Deploy hiện thủ công (Render.com theo git history). Có [docker-compose.yml](../docker-compose.yml) cho Postgres + Redis local (không phải production orchestration).
