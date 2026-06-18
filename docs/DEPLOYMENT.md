# NutriCoach Backend — Deployment Guide (Neon)

> Hướng dẫn này dành cho người deploy NutriCoach backend lên **Neon (PostgreSQL serverless)**.  
> Đọc toàn bộ trước khi bắt đầu — đặc biệt phần **Gotchas**.

---

## 1. Yêu cầu

| Thành phần | Yêu cầu |
|---|---|
| Node.js | ≥ 18 |
| npm | ≥ 9 |
| PostgreSQL | Neon free tier hoặc higher |
| Redis | Instance riêng (Railway, Upstash, hoặc tự host) |
| Cloudinary | Account free (25 GB storage/tháng) |
| Resend | Account free (email service) |
| PayOS | Merchant account |

---

## 2. Tạo Neon project

1. Đăng ký tại [neon.tech](https://neon.tech)
2. Tạo project mới → chọn region gần nhất (Singapore nếu deploy cho VN)
3. Vào **Dashboard → Connection Details** → copy từng field:

```
Host:     <id>.neon.tech
Database: <dbname>
User:     <user>
Password: <password>
Port:     5432
```

---

## 3. Cài đặt và build

```bash
# 1. Clone repo
git clone https://github.com/haospring398/nutricoach-backend.git
cd nutricoach-backend

# 2. Cài dependencies
npm install

# 3. Tạo file .env (xem mục 4)
cp .env.example .env   # nếu có, hoặc tạo mới

# 4. Build TypeScript
npm run build
```

---

## 4. Cấu hình `.env`

Tạo file `.env` ở root project với nội dung sau. **Điền đầy đủ tất cả các giá trị.**

```env
# ── Server ────────────────────────────────────────
NODE_ENV=production
PORT=3000

# ── Database (Neon) ───────────────────────────────
DB_HOST=<id>.neon.tech
DB_PORT=5432
DB_USER=<user>
DB_PASSWORD=<password>
DB_NAME=<dbname>
DB_SSL=true                        # bắt buộc với Neon

# ── JWT ───────────────────────────────────────────
# Mỗi secret phải ≥ 32 ký tự và KHÁC NHAU
JWT_SECRET=<random 32+ chars>
JWT_REFRESH_SECRET=<random 32+ chars, khác JWT_SECRET>

# ── Redis ─────────────────────────────────────────
REDIS_URL=redis://<host>:<port>

# ── Email (Resend) ────────────────────────────────
RESEND_API_KEY=re_<key>
EMAIL_FROM=no-reply@yourdomain.com

# ── Payment (PayOS) ───────────────────────────────
PAYOS_CLIENT_ID=<id>
PAYOS_API_KEY=<key>
PAYOS_CHECKSUM_KEY=<key>

# ── Cloudinary (avatar upload) ────────────────────
# ⚠️ Boot-required: server sẽ KHÔNG start nếu thiếu bất kỳ field nào dưới đây
CLOUDINARY_CLOUD_NAME=<cloud_name>
CLOUDINARY_API_KEY=<api_key>
CLOUDINARY_API_SECRET=<api_secret>

# ── CORS ─────────────────────────────────────────
# Điền URL frontend nếu có cấu hình CORS whitelist
# FRONTEND_URL=https://yourapp.com
```

---

## 5. Chạy migrations

```bash
npm run db:migrate
```

Lệnh này tạo toàn bộ **27 tables** từ migrations `0000–0018`.  
**Phải chạy trước `npm start`.**

> ⚠️ Migration viết tay (`0010+`) nên áp bằng `psql -f <file>.sql` trực tiếp thay vì `db:migrate` (drizzle journal hash bị corrupt với file viết tay). Xem `_bmad-output/project-context.md`.

---

## 6. Seed data

```bash
npm run seed:foods       # ~2,100 food items từ Viện Dinh dưỡng VN (NIN) — cần cho /foods
npm run seed:exercises   # ~40 bài tập trong exercise library — cần cho /workout
```

Không có seed data → foods search và workout sessions sẽ trả về empty.

---

## 7. Start server

```bash
npm start
```

Kiểm tra server boot thành công:

```bash
curl http://localhost:3000/health
# Expected: { "status": "ok" }
```

---

## 8. Smoke tests sau deploy

```bash
BASE=https://your-deployed-url.com
TOKEN=<accessToken từ POST /api/v1/auth/login>

# DB read
curl -s "$BASE/api/v1/auth/me" \
  -H "Authorization: Bearer $TOKEN" | jq .

# DB write
curl -s -X PATCH "$BASE/api/v1/users/me/metrics" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"weightKg":70}' | jq .

# Redis (refresh token)
curl -s -X POST "$BASE/api/v1/auth/refresh" \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<refreshToken>"}' | jq .
```

---

## 9. Gotchas quan trọng

### 🔴 Cloudinary là boot-required
Thiếu bất kỳ 1 trong 3 `CLOUDINARY_*` vars → **server crash ngay khi start**, không phải khi gọi avatar endpoint. Khác với PayOS (lazy-load khi gọi payment).

### 🔴 JWT secrets phải khác nhau
`JWT_SECRET` và `JWT_REFRESH_SECRET` phải khác nhau và mỗi cái ≥ 32 ký tự. Server vẫn boot nếu giống nhau nhưng security bị compromise.

### 🔴 Redis bắt buộc
Dùng cho refresh tokens, rate limiting, email verification. Không có Redis → auth không hoạt động.

### 🟡 Neon free tier: max 10 connections
Pool đã config `max: 5` phù hợp. Không tăng lên — Neon free tier giới hạn 10 connections tổng (kể cả migrations, monitoring tools).

### 🟡 Neon cold start
Neon suspend sau 5 phút không có activity. Request đầu tiên sau khi suspend có thể mất 5–10 giây. Đây là behavior bình thường của Neon free tier — pool đã config `connectionTimeoutMillis: 15s` để handle.

### 🟡 Không dùng `drizzle-kit push`
Một số migrations (`0010+`) được viết tay với journal entries riêng + partial unique indexes và CHECK constraints. `drizzle-kit push` sẽ bỏ qua chúng. **Không bao giờ `db:push` trên production.** Migration thường dùng `npm run db:migrate`; migration viết tay (`0010+`) áp bằng `psql -f <file>.sql` (xem mục 5).

### 🟡 `DB_SSL=true` bắt buộc với Neon
Nếu set `DB_SSL=false` hoặc bỏ trống → connection bị reject. Chỉ set `DB_SSL=false` khi test với local PostgreSQL.

---

## 10. Tóm tắt thứ tự deploy

```
npm install
→ Tạo .env với đầy đủ values
→ npm run build
→ npm run db:migrate
→ npm run seed:foods && npm run seed:exercises
→ npm start
→ Chạy smoke tests
```
