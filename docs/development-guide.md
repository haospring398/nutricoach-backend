# Development Guide — NutriCoach Backend

> Sinh bởi `bmad-document-project` (2026-06-18). Hướng dẫn dev local.

## Yêu cầu

| Thành phần | Phiên bản |
|---|---|
| Node.js | ≥ 18 |
| npm | ≥ 9 |
| PostgreSQL | 14+ (hoặc Neon serverless) |
| Redis | bất kỳ (local / Upstash / Railway) |

Tài khoản dịch vụ ngoài (có thể optional ở dev): Cloudinary (**boot-required**), Resend, PayOS, AI microservice URL.

## Cài đặt

```bash
git clone https://github.com/haospring398/nutricoach-backend.git
cd nutricoach-backend
npm install
cp .env.example .env     # rồi điền giá trị (xem mục Env)
```

### Postgres + Redis qua Docker (tùy chọn)
```bash
docker compose up -d      # khởi động postgres + redis local (docker-compose.yml)
```

## Biến môi trường

Đọc & validate qua [src/config/env.ts](../src/config/env.ts) (Zod). **Server exit ngay tại boot nếu thiếu/sai.** Các nhóm bắt buộc:

- **App:** `NODE_ENV`, `PORT` (default 3000)
- **DB:** `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SSL` (`true`/`false` — dùng enum, không coerce.boolean)
- **Redis:** `REDIS_URL`
- **JWT:** `JWT_SECRET`, `JWT_REFRESH_SECRET` (mỗi cái ≥ 32 ký tự, **phải khác nhau**), `JWT_EXPIRES_IN`/`JWT_REFRESH_EXPIRES_IN`
- **Cloudinary (boot-required):** `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- **AI microservice (boot-required):** `AI_SERVICE_URL`, `AI_SERVICE_SECRET`
- **Email:** `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`
- **Payment (optional ở dev):** `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`
- **Khác:** `CORS_ORIGIN`, `RATE_LIMIT_*`, `LOG_LEVEL`, `STORAGE_*`

## Scripts (package.json)

| Lệnh | Tác dụng |
|---|---|
| `npm run dev` | Dev server với nodemon + tsx (`src/server.ts`) |
| `npm run build` | Compile TypeScript → `dist/` |
| `npm start` | Chạy production (`node dist/server.js`) |
| `npm run db:generate` | Sinh migration từ schema (drizzle-kit) |
| `npm run db:migrate` | Áp migration (`src/db/migrate.ts`) |
| `npm run db:studio` | Drizzle Studio (browse DB) |
| `npm run seed:foods` | Seed food_items từ CSV (~2,100 món) |
| `npm run seed:exercises` | Seed exercises từ JSON (~40 bài) |
| `npm run test:connection` | Kiểm tra kết nối DB |

## Khởi động lần đầu

```bash
npm install
# điền .env
npm run db:migrate        # tạo toàn bộ bảng (0000–0020)
npm run seed:foods        # cần cho /foods
npm run seed:exercises    # cần cho /workout
npm run dev               # http://localhost:3000
curl http://localhost:3000/health
```

Swagger UI: `http://localhost:3000/api-docs` · raw spec: `/api-docs.json`.

## Quy trình thêm một feature/module

1. **Model** `src/models/<domain>.model.ts` → re-export trong `models/index.ts`.
2. **Migration** `npm run db:generate` (hoặc viết tay file `.sql` cho constraint phức tạp), rồi `npm run db:migrate` — runner áp cả migration journaled lẫn file viết tay ngoài journal (manual-SQL pass).
3. **Validation** `src/validations/<module>.validation.ts` (Zod).
4. **Service** `src/services/<module>.service.ts` (business logic, throw `ApiError` subclass).
5. **Controller** `src/controllers/<module>.controller.ts` (parse → service → envelope; có `handleError` local).
6. **Routes** `src/routes/<module>.routes.ts` (`router.use(authenticate)` + `@openapi` JSDoc) → mount trong `routes/index.ts`.
7. **Swagger tag** khai báo trong `config/swagger.ts`.
8. **Verify bằng curl** (smoke test — chưa có test framework).

## Quy tắc code (xem [project-context.md](../_bmad-output/project-context.md))

- `strict: true`, không `any`; dùng Drizzle `$inferSelect`, không tự khai interface trùng schema.
- Relative imports (không path alias).
- Không `process.env` ngoài `env.ts`; không `db` trong controller/route.
- Không thêm `authenticate` per-route khi router đã `router.use(authenticate)`.
- Comment chỉ WHY (constraint/workaround), không WHAT. Chạy ESLint + Prettier trước commit.
- **Không auto-commit** — luôn hỏi trước (xem memory `always-ask-before-commit`).

## Testing

Chưa có Jest/Vitest. Smoke test = curl. Khi thêm test: **Vitest**, file `*.service.test.ts` cạnh source, integration dùng DB thật (không mock Drizzle).
