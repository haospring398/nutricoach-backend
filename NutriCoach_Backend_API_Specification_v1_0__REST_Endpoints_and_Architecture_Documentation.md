# NutriCoach Backend — API Documentation v1

> **Tài liệu API Specification chính thức** cho dự án NutriCoach. Tuân thủ chuẩn REST + OpenAPI 3.1. Đây là **single source of truth** cho cả Backend team (Node.js + Express + TypeScript + Drizzle ORM) và Mobile team.
>
> **Version:** 1.0.0 · **Last updated:** 2026-05-13 · **Maintainer:** Backend Team

---

## 📑 Table of Contents

1. [Overview](#1-overview)
2. [Authentication & Authorization](#2-authentication--authorization)
3. [Common Conventions](#3-common-conventions)
4. [Module: `auth`](#4-module-auth)
5. [Module: `users`](#5-module-users)
6. [Module: `scan` (AI Food Scanning)](#6-module-scan-ai-food-scanning)
7. [Module: `nutrition`](#7-module-nutrition)
8. [Module: `workout`](#8-module-workout)
9. [Module: `pt`](#9-module-pt)
10. [Module: `payment` (PayOS)](#10-module-payment-payos)
11. [Module: `content`](#11-module-content)
12. [Module: `dashboard`](#12-module-dashboard)
13. [Module: `upload`](#13-module-upload)
14. [Module: `admin`](#14-module-admin)
15. [Appendix](#15-appendix)

---

## 1. Overview

**NutriCoach API** là REST API phục vụ ứng dụng di động kết hợp dinh dưỡng + luyện tập, gồm 3 đối tượng người dùng: Học viên (USER), Huấn luyện viên (PT), Quản trị viên (ADMIN).

| Hạng mục | Giá trị |
|---|---|
| **Base URL (Production)** | `https://api.nutricoach.vn/api/v1` |
| **Base URL (Staging)** | `https://api-staging.nutricoach.vn/api/v1` |
| **Protocol** | HTTPS bắt buộc (TLS 1.2+) |
| **Content-Type mặc định** | `application/json; charset=utf-8` |
| **Authentication** | Bearer JWT (Access Token) |
| **Versioning** | URI versioning (`/api/v1`) |
| **Time format** | ISO 8601 UTC (`2026-05-13T10:30:00.000Z`) |
| **Encoding** | UTF-8 |
| **Tiền tệ** | VND (số nguyên, không thập phân) |

---

## 2. Authentication & Authorization

### 2.1. Token Strategy

NutriCoach sử dụng mô hình **2 token** kết hợp **Refresh Token Rotation** theo khuyến nghị của OWASP OAuth2 Cheat Sheet.

| Token | Thời gian sống (TTL) | Lưu trữ | Vai trò |
|---|---|---|---|
| **Access Token** (JWT) | **15 phút** | Memory client | Gửi kèm mọi request qua header `Authorization: Bearer <token>` |
| **Refresh Token** (opaque, 64 bytes random) | **30 ngày** | Bảng `refresh_tokens` (PostgreSQL) + secure storage client | Đổi lấy access token mới |

**JWT payload (Access Token):**

```json
{
  "sub": "usr_01HXYZABC123",
  "role": "USER",
  "email": "nguyenvana@gmail.com",
  "tier": "PRO",
  "iat": 1715594400,
  "exp": 1715595300,
  "iss": "nutricoach-api",
  "aud": "nutricoach-mobile"
}
```

JWT được ký bằng **RS256** (asymmetric) với key pair lưu trong AWS KMS / Secrets Manager.

### 2.2. Refresh Token Rotation Logic

Mỗi lần client gọi `POST /auth/refresh`:

1. Backend tra cứu refresh token trong bảng `refresh_tokens` (đã hash SHA-256 trước khi lưu).
2. Kiểm tra `revoked = false`, `used = false`, `expires_at > now()`.
3. **Tạo cặp token mới** (access + refresh).
4. Đánh dấu refresh token cũ: `used = true`, `replaced_by = new_token_id`.
5. Lưu refresh token mới với cùng `family_id` (token family tracking).

**Reuse Detection:** Nếu một refresh token có `used = true` bị gửi lại → đây là dấu hiệu **bị đánh cắp**. Backend sẽ:
- Revoke toàn bộ `family_id` (tất cả token cùng dòng).
- Ghi log security event.
- Bắt buộc user re-authenticate (trả `401 TOKEN_REUSE_DETECTED`).

Schema bảng `refresh_tokens` (Drizzle):

```ts
refreshTokens: pgTable("refresh_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  familyId: uuid("family_id").notNull(),
  used: boolean("used").default(false),
  revoked: boolean("revoked").default(false),
  replacedBy: uuid("replaced_by"),
  userAgent: text("user_agent"),
  ipAddress: varchar("ip_address", { length: 45 }),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});
```

### 2.3. OAuth Flow

- **Google Sign-In:** Client (mobile) thực hiện sign-in qua Google SDK, lấy `idToken`, gửi lên backend `POST /auth/google`. Backend verify ID token bằng `google-auth-library` (`verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID })`) — verify JWT signature, claim `aud`, `exp`, `iss = accounts.google.com`. Backend dùng `sub` claim làm primary key liên kết.
- **Apple Sign-In:** Client gửi `identityToken` + `authorizationCode`. Backend verify identity token theo Apple's public keys (`https://appleid.apple.com/auth/keys`), kiểm tra `iss = https://appleid.apple.com`, `aud = bundle ID`, `exp`. Dùng `sub` làm Apple User ID.

### 2.4. Roles & Authorization

| Role | Mô tả | Access |
|---|---|---|
| `PUBLIC` | Không cần token | Đăng ký, đăng nhập, articles công khai |
| `USER` | Học viên (free/pro) | Tất cả tính năng học viên |
| `PT` | Huấn luyện viên đã verified | Quản lý học viên, khóa học, thu nhập |
| `ADMIN` | Quản trị | Duyệt PT, withdrawal, moderation |

Middleware: `requireAuth()`, `requireRole('PT')`, `requireRole(['PT','ADMIN'])`.

---

## 3. Common Conventions

### 3.1. Common Request Headers

```
Authorization: Bearer <access_token>
Content-Type: application/json
Accept-Language: vi-VN
X-Device-Id: <uuid>            # ID thiết bị client (optional, để analytics)
X-App-Version: 1.4.2           # Version mobile app
Idempotency-Key: <uuid>        # Bắt buộc cho POST /payment/*, /pt/withdrawals
```

### 3.2. Common Response — Success Envelope

```json
{
  "success": true,
  "data": { /* payload */ },
  "meta": { "requestId": "req_01HXYZ...", "timestamp": "2026-05-13T10:30:00.000Z" }
}
```

### 3.3. Common Response — Error Envelope

Theo nguyên tắc của RFC 7807 nhưng giữ envelope nhất quán:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Dữ liệu đầu vào không hợp lệ",
    "details": [
      { "field": "email", "rule": "email", "message": "Email không đúng định dạng" },
      { "field": "password", "rule": "min", "message": "Mật khẩu tối thiểu 8 ký tự" }
    ]
  },
  "meta": { "requestId": "req_01HXYZ...", "timestamp": "2026-05-13T10:30:00.000Z" }
}
```

### 3.4. HTTP Status Codes Convention

| Code | Khi nào dùng |
|---|---|
| `200 OK` | GET / PUT / PATCH thành công |
| `201 Created` | POST tạo resource mới |
| `202 Accepted` | Job async (AI meal plan đang generate) |
| `204 No Content` | DELETE / logout thành công |
| `400 Bad Request` | Body sai format JSON |
| `401 Unauthorized` | Token thiếu / hết hạn / sai |
| `403 Forbidden` | Token hợp lệ nhưng không đủ quyền |
| `404 Not Found` | Resource không tồn tại |
| `409 Conflict` | Email đã tồn tại / duplicate idempotency |
| `422 Unprocessable Entity` | Validation Zod fail |
| `429 Too Many Requests` | Rate limit |
| `500 Internal Server Error` | Lỗi server không lường trước |
| `503 Service Unavailable` | OpenAI / PayOS downstream lỗi |

### 3.5. Standard Error Codes

| Code | HTTP | Mô tả |
|---|---|---|
| `VALIDATION_ERROR` | 422 | Zod validation thất bại |
| `UNAUTHORIZED` | 401 | Token không hợp lệ |
| `TOKEN_EXPIRED` | 401 | Access token hết hạn |
| `TOKEN_REUSE_DETECTED` | 401 | Refresh token bị reuse → security event |
| `FORBIDDEN` | 403 | Role không đủ |
| `RESOURCE_NOT_FOUND` | 404 | Không tìm thấy |
| `EMAIL_ALREADY_EXISTS` | 409 | Email đã đăng ký |
| `RATE_LIMITED` | 429 | Quá nhiều request |
| `PAYMENT_FAILED` | 402 | PayOS từ chối |
| `AI_SERVICE_UNAVAILABLE` | 503 | OpenAI lỗi |

### 3.6. Pagination

Mặc định **offset-based** với query params:

```
GET /api/v1/articles?page=1&limit=20&sort=-publishedAt&search=protein
```

Response:

```json
{
  "success": true,
  "data": [ /* items */ ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalItems": 156,
    "totalPages": 8,
    "hasNext": true,
    "hasPrev": false
  }
}
```

- `limit` max = 100, default = 20.
- `sort` dùng prefix `-` cho DESC (vd: `-createdAt`).
- Đối với feed dài (workout logs, food logs) → dùng **cursor-based**: `?cursor=eyJpZCI6...&limit=20`.

### 3.7. Rate Limiting Headers

Tất cả response trả:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1715595900
Retry-After: 42        # chỉ khi 429
```

Default limits: `100 req/15 min/IP` cho auth endpoints, `1000 req/15 min/user` cho authenticated endpoints, `10 req/min/user` cho `/scan` (do gọi OpenAI tốn kém).

### 3.8. Cache Headers

GET endpoints public (articles, exercise library) trả `Cache-Control: public, max-age=300, stale-while-revalidate=60` + `ETag`. Endpoints authenticated dùng `Cache-Control: private, no-store`.

### 3.9. Idempotency

Các endpoint `POST /payment/checkout`, `POST /pt/withdrawals` **bắt buộc** header `Idempotency-Key` (UUID v4). Backend lưu (key, response) trong Redis TTL 24h; request trùng key trả lại response cũ.

---

## 4. Module: `auth`

### 4.1. `POST /api/v1/auth/register`

**Mô tả:** Đăng ký tài khoản học viên mới bằng email + password.

- **Auth:** Không
- **Authorization:** PUBLIC

**Request Body:**

```json
{
  "email": "nguyenvana@gmail.com",
  "password": "MatKhau@2026",
  "fullName": "Nguyễn Văn A",
  "acceptTerms": true
}
```

**Validation (Zod):**
- `email`: string, email format, lowercase, max 255.
- `password`: string, min 8, phải có 1 chữ hoa, 1 số, 1 ký tự đặc biệt.
- `fullName`: string, min 2, max 100, trim.
- `acceptTerms`: boolean, phải = `true`.

**Response `201 Created`:**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "usr_01HXYZABC123",
      "email": "nguyenvana@gmail.com",
      "fullName": "Nguyễn Văn A",
      "role": "USER",
      "tier": "FREE",
      "emailVerified": false,
      "onboardingCompleted": false,
      "createdAt": "2026-05-13T10:30:00.000Z"
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJSUzI1NiIs...",
      "refreshToken": "rft_a1b2c3d4e5f6...",
      "expiresIn": 900
    }
  }
}
```

**Errors:**
- `409 EMAIL_ALREADY_EXISTS` — Email đã tồn tại
- `422 VALIDATION_ERROR` — Mật khẩu yếu / email sai format
- `429 RATE_LIMITED` — Quá nhiều lần đăng ký từ IP

---

### 4.2. `POST /api/v1/auth/login`

**Mô tả:** Đăng nhập bằng email + mật khẩu.

- **Auth:** Không
- **Authorization:** PUBLIC

**Request Body:**

```json
{
  "email": "nguyenvana@gmail.com",
  "password": "MatKhau@2026"
}
```

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "usr_01HXYZABC123",
      "email": "nguyenvana@gmail.com",
      "fullName": "Nguyễn Văn A",
      "role": "USER",
      "tier": "PRO",
      "avatarUrl": "https://cdn.nutricoach.vn/avatars/usr_01HXYZABC123.jpg"
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJSUzI1NiIs...",
      "refreshToken": "rft_a1b2c3d4e5f6...",
      "expiresIn": 900
    }
  }
}
```

**Errors:** `401 INVALID_CREDENTIALS`, `403 ACCOUNT_LOCKED` (sau 5 lần sai liên tiếp), `403 EMAIL_NOT_VERIFIED`.

---

### 4.3. `POST /api/v1/auth/google`

**Mô tả:** Đăng nhập/đăng ký qua Google Sign-In. Backend verify ID token bằng Google Auth Library.

- **Auth:** Không · **Authorization:** PUBLIC

**Request Body:**

```json
{ "idToken": "eyJhbGciOiJSUzI1NiIs..." }
```

**Logic backend:**
1. `client.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_IDS })` — verify chữ ký, `aud`, `exp`, `iss`.
2. Lấy `sub`, `email`, `name`, `picture` từ payload.
3. Tìm user theo `googleId = sub`, nếu chưa có → tạo user mới (`role = USER`, `emailVerified = true`).
4. Phát hành cặp access + refresh token.

**Response `200 OK`:** Giống response của `/login`, kèm `isNewUser: boolean`.

**Errors:** `401 INVALID_OAUTH_TOKEN`, `422 VALIDATION_ERROR`.

---

### 4.4. `POST /api/v1/auth/apple`

**Mô tả:** Đăng nhập/đăng ký qua Apple Sign-In.

- **Auth:** Không · **Authorization:** PUBLIC

**Request Body:**

```json
{
  "identityToken": "eyJraWQiOiJ...",
  "authorizationCode": "c123abc...",
  "fullName": "Nguyễn Văn A",
  "email": "nguyenvana@privaterelay.appleid.com"
}
```

> Lưu ý: Apple chỉ trả `fullName` và `email` ở **lần đầu** sign-in. Client phải cache và gửi lại nếu user xóa app rồi cài lại.

**Logic backend:** Fetch JWKS từ `https://appleid.apple.com/auth/keys`, verify identity token (`iss = https://appleid.apple.com`, `aud = vn.nutricoach.app`, `exp`). Optional: dùng authorization code để gọi `/auth/token` của Apple lấy refresh token (cho server-side revocation).

**Response:** Giống `/auth/google`.

---

### 4.5. `POST /api/v1/auth/refresh`

**Mô tả:** Đổi refresh token cũ lấy cặp access + refresh token mới (rotation).

- **Auth:** Không (dùng chính refresh token) · **Authorization:** PUBLIC

**Request Body:**

```json
{ "refreshToken": "rft_a1b2c3d4e5f6..." }
```

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJSUzI1NiIs...",
    "refreshToken": "rft_x9y8z7w6v5u4...",
    "expiresIn": 900
  }
}
```

**Errors:**
- `401 INVALID_REFRESH_TOKEN`
- `401 REFRESH_TOKEN_EXPIRED`
- `401 TOKEN_REUSE_DETECTED` — Đã used trước đó → revoke cả family

---

### 4.6. `POST /api/v1/auth/logout`

**Mô tả:** Đăng xuất thiết bị hiện tại (revoke refresh token đang dùng).

- **Auth:** Bearer · **Authorization:** USER / PT / ADMIN

**Request Body:**

```json
{ "refreshToken": "rft_a1b2c3d4e5f6..." }
```

**Response `204 No Content`.**

---

### 4.7. `POST /api/v1/auth/logout-all`

**Mô tả:** Đăng xuất khỏi tất cả thiết bị (revoke toàn bộ refresh token của user).

- **Auth:** Bearer · **Authorization:** USER / PT / ADMIN

**Response `204 No Content`.**

---

### 4.8. `POST /api/v1/auth/forgot-password`

**Mô tả:** Gửi email chứa link/OTP đặt lại mật khẩu.

- **Auth:** Không · **Authorization:** PUBLIC

**Request Body:**

```json
{ "email": "nguyenvana@gmail.com" }
```

**Response `200 OK`:** Luôn trả thành công (kể cả khi email không tồn tại) — chống enumeration.

```json
{ "success": true, "data": { "message": "Nếu email tồn tại, link đặt lại mật khẩu đã được gửi" } }
```

Token reset có TTL **15 phút**, lưu Redis `password_reset:<token> → userId`.

---

### 4.9. `POST /api/v1/auth/reset-password`

**Mô tả:** Đặt lại mật khẩu bằng token nhận qua email.

- **Auth:** Không · **Authorization:** PUBLIC

**Request Body:**

```json
{
  "token": "prt_a1b2c3d4e5f6...",
  "newPassword": "MatKhauMoi@2026"
}
```

**Response `200 OK`:** `{ "success": true, "data": { "message": "Đặt lại mật khẩu thành công" } }`. Đồng thời revoke toàn bộ refresh token của user.

**Errors:** `400 INVALID_RESET_TOKEN`, `400 RESET_TOKEN_EXPIRED`.

---

### 4.10. `POST /api/v1/auth/verify-email`

**Mô tả:** Xác minh email bằng token gửi qua email.

- **Auth:** Không · **Authorization:** PUBLIC

**Request Body:** `{ "token": "evt_..." }`

**Response `200 OK`:** `{ "success": true, "data": { "emailVerified": true } }`.

---

### 4.11. `POST /api/v1/auth/resend-verification`

**Mô tả:** Gửi lại email xác minh.

- **Auth:** Bearer · **Authorization:** USER (chưa verified) · Rate limit 1 req/60s.

---

## 5. Module: `users`

### 5.1. `GET /api/v1/users/me`

**Mô tả:** Lấy thông tin user hiện tại (kèm onboarding metrics, subscription).

- **Auth:** Bearer · **Authorization:** USER / PT / ADMIN

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "id": "usr_01HXYZABC123",
    "email": "nguyenvana@gmail.com",
    "fullName": "Nguyễn Văn A",
    "avatarUrl": "https://cdn.nutricoach.vn/avatars/usr_01HXYZABC123.jpg",
    "phone": "+84901234567",
    "role": "USER",
    "tier": "PRO",
    "emailVerified": true,
    "onboardingCompleted": true,
    "metrics": {
      "gender": "MALE",
      "dateOfBirth": "1998-03-15",
      "heightCm": 175,
      "weightKg": 72.5,
      "activityLevel": "MODERATE",
      "goal": "LOSE_WEIGHT",
      "targetWeightKg": 68,
      "bmr": 1693,
      "tdee": 2624,
      "dailyCalorieTarget": 2124,
      "macros": { "proteinG": 159, "carbsG": 212, "fatG": 71 }
    },
    "subscription": {
      "status": "ACTIVE",
      "plan": "PRO_YEARLY",
      "startedAt": "2026-01-10T00:00:00.000Z",
      "expiresAt": "2027-01-10T00:00:00.000Z",
      "autoRenew": false
    },
    "createdAt": "2025-09-20T08:00:00.000Z"
  }
}
```

---

### 5.2. `PATCH /api/v1/users/me`

**Mô tả:** Cập nhật thông tin cá nhân (partial update).

- **Auth:** Bearer · **Authorization:** USER / PT / ADMIN

**Request Body (tất cả optional):**

```json
{
  "fullName": "Nguyễn Văn An",
  "phone": "+84901234567",
  "avatarUrl": "https://cdn.nutricoach.vn/avatars/...",
  "preferredLanguage": "vi"
}
```

**Validation:** `fullName` 2-100 ký tự, `phone` E.164 VN regex `/^\+84[0-9]{9}$/`.

**Response `200 OK`:** trả về user object cập nhật.

---

### 5.3. `POST /api/v1/users/me/onboarding`

**Mô tả:** Submit chỉ số cơ thể lần đầu, hệ thống tính BMR/TDEE bằng công thức **Mifflin-St Jeor** và sinh target calo/macro theo mục tiêu.

- **Auth:** Bearer · **Authorization:** USER

**Request Body:**

```json
{
  "gender": "MALE",
  "dateOfBirth": "1998-03-15",
  "heightCm": 175,
  "weightKg": 72.5,
  "activityLevel": "MODERATE",
  "goal": "LOSE_WEIGHT",
  "targetWeightKg": 68,
  "dietaryRestrictions": ["NO_SEAFOOD"],
  "allergies": []
}
```

**Validation:**
- `gender`: enum `MALE | FEMALE`.
- `dateOfBirth`: ISO date, tuổi 13–100.
- `heightCm`: 100–250.
- `weightKg`: 30–300.
- `activityLevel`: enum `SEDENTARY | LIGHT | MODERATE | ACTIVE | VERY_ACTIVE`.
- `goal`: enum `LOSE_WEIGHT | MAINTAIN | GAIN_WEIGHT | GAIN_MUSCLE`.

**Logic tính toán:**
- **BMR (Mifflin-St Jeor):**
  - Nam: `10 × kg + 6.25 × cm − 5 × age + 5`
  - Nữ: `10 × kg + 6.25 × cm − 5 × age − 161`
- **TDEE = BMR × activityMultiplier**, với:
  - `SEDENTARY = 1.2` · `LIGHT = 1.375` · `MODERATE = 1.55` · `ACTIVE = 1.725` · `VERY_ACTIVE = 1.9`
- **Daily Calorie Target:** `LOSE_WEIGHT` = TDEE − 500; `GAIN_WEIGHT/MUSCLE` = TDEE + 300; `MAINTAIN` = TDEE.
- **Macros (g):** Protein 30% × kcal / 4; Carbs 40% × kcal / 4; Fat 30% × kcal / 9.

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "bmr": 1693,
    "tdee": 2624,
    "dailyCalorieTarget": 2124,
    "macros": { "proteinG": 159, "carbsG": 212, "fatG": 71 },
    "onboardingCompleted": true
  }
}
```

---

### 5.4. `GET /api/v1/users/me/metrics`

**Mô tả:** Lấy BMI/BMR/TDEE đã tính.

- **Auth:** Bearer · **Authorization:** USER

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "bmi": 23.7,
    "bmiCategory": "NORMAL",
    "bmr": 1693,
    "tdee": 2624,
    "dailyCalorieTarget": 2124,
    "macros": { "proteinG": 159, "carbsG": 212, "fatG": 71 }
  }
}
```

---

### 5.5. `POST /api/v1/users/me/change-password`

**Mô tả:** Đổi mật khẩu (yêu cầu mật khẩu cũ).

- **Auth:** Bearer · **Authorization:** USER / PT / ADMIN

**Request Body:** `{ "currentPassword": "...", "newPassword": "..." }`.

**Response `204 No Content`.** Đồng thời revoke tất cả refresh token khác (giữ lại token hiện tại nếu mobile mong muốn).

---

### 5.6. `DELETE /api/v1/users/me`

**Mô tả:** Xóa tài khoản (soft delete, chờ 30 ngày trước khi xóa cứng — tuân thủ GDPR-style).

- **Auth:** Bearer · **Authorization:** USER

**Request Body:** `{ "password": "...", "reason": "Không dùng nữa" }`.

**Response `204 No Content`.**

---

### 5.7. `POST /api/v1/users/me/avatar`

**Mô tả:** Cập nhật avatar sau khi upload qua presigned URL.

- **Auth:** Bearer · **Authorization:** USER / PT / ADMIN

**Request Body:** `{ "fileKey": "avatars/usr_01HXYZABC123/abc.jpg" }`.

**Response `200 OK`:** `{ "success": true, "data": { "avatarUrl": "https://cdn.nutricoach.vn/avatars/..." } }`.

---

## 6. Module: `scan` (AI Food Scanning)

### 6.1. `POST /api/v1/scan`

**Mô tả:** Upload ảnh món ăn, AI (OpenAI GPT-4o Vision) nhận diện món + ước lượng size (S/M/L) + topping thường gặp + macro/calo. **Background upload** ảnh lên S3 (không block response).

- **Auth:** Bearer · **Authorization:** USER · **Rate limit:** 10 req/phút/user

**Request:**

- **Content-Type:** `multipart/form-data`
- **Field:** `image` (file: jpg/png/webp, max **10 MB**)
- **Field (optional):** `note` (string, max 200) — gợi ý cho AI, vd `"Bún bò Huế tô đặc biệt"`

**Backend flow:**
1. Multer `memoryStorage` → buffer trong RAM.
2. Validate MIME + magic bytes + size.
3. Gửi buffer (base64 data URL) tới OpenAI GPT-4o Vision với structured prompt yêu cầu JSON output. Schema gồm: `detectedFood`, `confidence`, `sizes`, `commonToppings`, `estimatedCalories`, `macros`.
4. **Song song** (non-blocking): upload buffer lên S3 tại `scans/{userId}/{scanId}.jpg`, ghi DB `food_scans`.
5. Trả response ngay khi AI hoàn tất (~3–8s), không chờ S3.

**Prompt mẫu cho OpenAI:**

> "Bạn là chuyên gia dinh dưỡng Việt Nam. Phân tích ảnh món ăn, trả về JSON gồm: tên món (Việt + English), độ tin cậy (0–1), 3 mức size S/M/L với khối lượng gram và calo tương ứng, danh sách 3–5 topping thường ăn kèm (mỗi topping kèm calo), macro (protein/carbs/fat g) cho size M. Đáp ứng chuẩn JSON schema sau: { ... }"

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "scanId": "scn_01HXYZABC123",
    "detectedFood": {
      "nameVi": "Phở bò tái",
      "nameEn": "Vietnamese beef noodle soup (rare beef)",
      "confidence": 0.92,
      "category": "NOODLE_SOUP"
    },
    "sizes": [
      { "size": "S", "weightG": 400, "calories": 380 },
      { "size": "M", "weightG": 550, "calories": 520 },
      { "size": "L", "weightG": 700, "calories": 680 }
    ],
    "commonToppings": [
      { "name": "Quẩy", "calories": 80, "selected": false },
      { "name": "Trứng chần", "calories": 70, "selected": false },
      { "name": "Gân bò", "calories": 95, "selected": false },
      { "name": "Tương đen + tương ớt", "calories": 25, "selected": true }
    ],
    "macros": { "proteinG": 32, "carbsG": 68, "fatG": 12 },
    "estimatedCalories": 520,
    "imageUrl": "https://cdn.nutricoach.vn/scans/usr_01HXYZABC123/scn_01HXYZABC123.jpg",
    "scannedAt": "2026-05-13T12:15:30.000Z"
  }
}
```

**Errors:**
- `400 INVALID_IMAGE_FORMAT` — Không phải jpg/png/webp
- `413 IMAGE_TOO_LARGE` — > 10MB
- `422 NO_FOOD_DETECTED` — AI không nhận diện được món ăn
- `503 AI_SERVICE_UNAVAILABLE` — OpenAI timeout / rate limit
- `429 RATE_LIMITED`

---

### 6.2. `POST /api/v1/scan/:scanId/confirm`

**Mô tả:** User chỉnh sửa size và topping rồi confirm → ghi vào food log của ngày.

- **Auth:** Bearer · **Authorization:** USER

**Path Params:** `scanId` — ID kết quả scan.

**Request Body:**

```json
{
  "selectedSize": "M",
  "selectedToppings": ["Quẩy", "Trứng chần"],
  "portion": 1,
  "mealType": "LUNCH",
  "consumedAt": "2026-05-13T12:30:00.000Z"
}
```

**Validation:**
- `selectedSize`: enum `S|M|L`.
- `portion`: number, 0.25–5, step 0.25.
- `mealType`: enum `BREAKFAST | LUNCH | DINNER | SNACK`.

**Response `201 Created`:**

```json
{
  "success": true,
  "data": {
    "foodLogId": "flg_01HXYZ...",
    "scanId": "scn_01HXYZABC123",
    "totalCalories": 670,
    "macros": { "proteinG": 38, "carbsG": 72, "fatG": 14 },
    "remainingDailyCalories": 1454,
    "consumedAt": "2026-05-13T12:30:00.000Z"
  }
}
```

---

### 6.3. `GET /api/v1/scan/history`

**Mô tả:** Lịch sử scan (phân trang).

- **Auth:** Bearer · **Authorization:** USER

**Query:** `?page=1&limit=20&from=2026-05-01&to=2026-05-13`

**Response `200 OK`:** mảng `scans[]` + `pagination`.

---

### 6.4. `GET /api/v1/scan/:scanId`

**Mô tả:** Chi tiết một scan. **Auth:** Bearer · **USER** (chỉ owner).

---

## 7. Module: `nutrition`

### 7.1. `POST /api/v1/nutrition/meal-plans/generate`

**Mô tả:** AI sinh thực đơn 7 ngày dựa trên TDEE, mục tiêu, restrictions. Trả `202 Accepted` + jobId, client poll `/jobs/:id`. (Có thể stream qua SSE ở v1.1.)

- **Auth:** Bearer · **Authorization:** USER tier PRO

**Request Body:**

```json
{
  "durationDays": 7,
  "mealsPerDay": 4,
  "cuisinePreference": ["VIETNAMESE", "ASIAN"],
  "excludeIngredients": ["tôm", "cua"],
  "budgetLevel": "MEDIUM"
}
```

**Response `202 Accepted`:**

```json
{ "success": true, "data": { "jobId": "job_01HXYZ...", "status": "PROCESSING", "estimatedSeconds": 25 } }
```

### 7.2. `GET /api/v1/nutrition/meal-plans/active`

Lấy meal plan đang dùng của user. Trả mảng `days[]`, mỗi day có `meals[]` với `name`, `calories`, `macros`, `recipeSteps`, `ingredients`.

### 7.3. `POST /api/v1/nutrition/food-logs`

**Mô tả:** Ghi nhận món đã ăn (manual entry hoặc từ scan).

```json
{
  "foodId": "fd_pho_bo",
  "customName": null,
  "calories": 520,
  "macros": { "proteinG": 32, "carbsG": 68, "fatG": 12 },
  "portion": 1,
  "mealType": "LUNCH",
  "consumedAt": "2026-05-13T12:30:00.000Z"
}
```

### 7.4. `GET /api/v1/nutrition/food-logs?date=2026-05-13`

Trả mảng food logs trong ngày + tổng calo/macro.

### 7.5. `PATCH /api/v1/nutrition/food-logs/:id`, `DELETE /api/v1/nutrition/food-logs/:id`

CRUD chuẩn.

### 7.6. `GET /api/v1/nutrition/summary/daily?date=2026-05-13`

**Response:**

```json
{
  "success": true,
  "data": {
    "date": "2026-05-13",
    "target": { "calories": 2124, "protein": 159, "carbs": 212, "fat": 71 },
    "consumed": { "calories": 1450, "protein": 95, "carbs": 145, "fat": 48 },
    "remaining": { "calories": 674, "protein": 64, "carbs": 67, "fat": 23 },
    "progressPercent": 68.3,
    "meals": { "breakfast": 420, "lunch": 670, "dinner": 0, "snack": 360 }
  }
}
```

### 7.7. `GET /api/v1/nutrition/summary/weekly?weekStart=2026-05-12`

Trả 7 ngày + average.

---

## 8. Module: `workout`

### 8.1. `GET /api/v1/workout/exercises`

**Mô tả:** Kho bài tập 2D có phân trang + filter.

- **Auth:** Bearer · **Authorization:** USER / PT
- **Query:** `?muscleGroup=CHEST&equipment=DUMBBELL&difficulty=BEGINNER&page=1&limit=20&search=push`

**Response item:**

```json
{
  "id": "ex_pushup_standard",
  "nameVi": "Hít đất tiêu chuẩn",
  "nameEn": "Standard Push-Up",
  "muscleGroups": ["CHEST", "TRICEPS", "SHOULDERS"],
  "equipment": "BODYWEIGHT",
  "difficulty": "BEGINNER",
  "caloriesPerMinute": 8,
  "thumbnailUrl": "https://cdn.nutricoach.vn/exercises/pushup.webp",
  "animation2dUrl": "https://cdn.nutricoach.vn/exercises/pushup.gif",
  "youtubeVideoId": "IODxDxX7oi4"
}
```

### 8.2. `GET /api/v1/workout/exercises/:id`

Chi tiết bài tập kèm `instructions[]`, `commonMistakes[]`, `variations[]`.

### 8.3. `POST /api/v1/workout/sessions`

**Mô tả:** Bắt đầu một session tập (free user tự chọn).

```json
{
  "name": "Buổi ngực vai",
  "plannedExercises": [
    { "exerciseId": "ex_pushup_standard", "sets": 3, "reps": 15 },
    { "exerciseId": "ex_bench_press", "sets": 4, "reps": 10, "weightKg": 40 }
  ]
}
```

**Response `201`:** `{ sessionId, startedAt, ... }`.

### 8.4. `POST /api/v1/workout/sessions/:id/logs`

Ghi nhận từng set đã hoàn thành: `{ exerciseId, setNumber, reps, weightKg, restSec, rpe }`.

### 8.5. `POST /api/v1/workout/sessions/:id/finish`

Body: `{ caloriesBurned, notes }`. Trả tổng kết.

### 8.6. `GET /api/v1/workout/sessions?from=...&to=...`

Lịch sử sessions.

### 8.7. `GET /api/v1/workout/programs/me`

Giáo án được PT giao (paid user).

---

## 9. Module: `pt`

### 9.1. `POST /api/v1/pt/verification`

**Mô tả:** PT submit hồ sơ xác minh: CCCD (front/back) + bằng cấp/chứng chỉ — đã upload qua presigned URL trước đó.

- **Auth:** Bearer · **Authorization:** USER (chưa là PT)

**Request Body:**

```json
{
  "fullName": "Trần Văn B",
  "dateOfBirth": "1990-07-22",
  "citizenIdNumber": "001090012345",
  "citizenIdFrontKey": "pt-verification/usr_xxx/cccd-front.jpg",
  "citizenIdBackKey": "pt-verification/usr_xxx/cccd-back.jpg",
  "certificates": [
    {
      "name": "Chứng chỉ HLV thể hình quốc tế ACE",
      "issuedBy": "American Council on Exercise",
      "issuedAt": "2022-06-15",
      "fileKey": "pt-verification/usr_xxx/cert-ace.pdf"
    }
  ],
  "specialties": ["WEIGHT_LOSS", "STRENGTH_TRAINING"],
  "yearsOfExperience": 5,
  "bio": "5 năm kinh nghiệm coach giảm cân, hơn 200 học viên...",
  "bankAccount": {
    "bankCode": "VCB",
    "accountNumber": "0123456789",
    "accountHolder": "TRAN VAN B"
  }
}
```

**Response `201 Created`:**

```json
{
  "success": true,
  "data": {
    "verificationId": "ptv_01HXYZ...",
    "status": "PENDING_REVIEW",
    "submittedAt": "2026-05-13T14:00:00.000Z",
    "estimatedReviewHours": 48
  }
}
```

### 9.2. `GET /api/v1/pt/verification/status`

Trả `{ status: PENDING_REVIEW | APPROVED | REJECTED, rejectReason?, reviewedAt? }`.

### 9.3. `GET /api/v1/pt/me`

PT profile (chỉ PT đã verified).

- **Auth:** Bearer · **Authorization:** PT

### 9.4. `PATCH /api/v1/pt/me`

Cập nhật `bio`, `specialties`, `bankAccount`, `commissionRate` (read-only).

### 9.5. `GET /api/v1/pt/students`

**Mô tả:** Danh sách học viên đã mua khóa.

- **Auth:** Bearer · **Authorization:** PT
- **Query:** `?page=1&limit=20&status=ACTIVE&search=nguyen`

**Response item:**

```json
{
  "studentId": "usr_01HABC...",
  "fullName": "Nguyễn Văn A",
  "avatarUrl": "...",
  "courseId": "crs_giam_can_30d",
  "enrolledAt": "2026-04-01T00:00:00.000Z",
  "progressPercent": 42,
  "lastActiveAt": "2026-05-13T08:00:00.000Z",
  "currentWeightKg": 72.5,
  "weightChangeKg": -1.8
}
```

### 9.6. `GET /api/v1/pt/students/:studentId`

Chi tiết tiến độ: weight history, workout sessions, nutrition adherence, photos.

### 9.7. `PUT /api/v1/pt/students/:studentId/meal-plan`

**Mô tả:** PT can thiệp điều chỉnh thực đơn của học viên (override AI).

```json
{
  "days": [
    {
      "dayIndex": 0,
      "meals": [
        { "mealType": "BREAKFAST", "name": "Yến mạch + chuối", "calories": 380, "macros": { "proteinG": 18, "carbsG": 60, "fatG": 8 } }
      ]
    }
  ],
  "note": "Giảm carbs sau 18h, tăng protein bữa sáng"
}
```

### 9.8. `POST /api/v1/pt/students/:studentId/exercises`

**Mô tả:** PT thêm bài tập custom ngoài giáo án cho học viên.

```json
{
  "exerciseId": "ex_plank_side",
  "scheduledDate": "2026-05-14",
  "sets": 3,
  "durationSec": 45,
  "note": "Tập sau cardio"
}
```

### 9.9. `POST /api/v1/pt/courses`

**Mô tả:** Tạo khóa học mới (paid course PT bán).

```json
{
  "title": "Giảm 5kg trong 30 ngày — Cardio Combo",
  "description": "Chương trình kết hợp HIIT + dinh dưỡng...",
  "thumbnailKey": "courses/crs_xxx/thumb.jpg",
  "priceVnd": 1490000,
  "durationDays": 30,
  "modules": [
    {
      "title": "Tuần 1 — Khởi động",
      "lessons": [
        { "title": "Day 1 — Warm-up", "youtubeVideoId": "abc123", "durationMin": 25 }
      ]
    }
  ],
  "tags": ["WEIGHT_LOSS", "CARDIO"]
}
```

**Response `201`:** `{ courseId, status: DRAFT, ... }`. Khóa học cần được Admin duyệt trước khi publish.

### 9.10. `GET /api/v1/pt/courses` · `PATCH /api/v1/pt/courses/:id` · `POST /api/v1/pt/courses/:id/publish`

CRUD chuẩn.

### 9.11. `GET /api/v1/pt/earnings`

**Mô tả:** Báo cáo thu nhập. App thu **10% hoa hồng**, PT nhận **90%** mỗi giao dịch.

- **Auth:** Bearer · **Authorization:** PT
- **Query:** `?from=2026-01-01&to=2026-05-13&granularity=month`

**Response:**

```json
{
  "success": true,
  "data": {
    "totalRevenueVnd": 45200000,
    "platformFeeVnd": 4520000,
    "netEarningsVnd": 40680000,
    "availableBalanceVnd": 28500000,
    "pendingWithdrawalVnd": 5000000,
    "withdrawnTotalVnd": 7180000,
    "breakdown": [
      { "period": "2026-04", "gross": 12000000, "fee": 1200000, "net": 10800000, "transactions": 8 }
    ]
  }
}
```

### 9.12. `POST /api/v1/pt/withdrawals`

**Mô tả:** PT yêu cầu rút tiền. **Bắt buộc** header `Idempotency-Key`.

- **Auth:** Bearer · **Authorization:** PT

**Request Body:**

```json
{ "amountVnd": 5000000, "note": "Rút thu nhập tháng 4" }
```

**Validation:** `amountVnd` ≥ 200,000, ≤ `availableBalanceVnd`, bội số 1,000.

**Response `201`:** `{ withdrawalId, status: "PENDING_APPROVAL", requestedAt }`.

### 9.13. `GET /api/v1/pt/withdrawals?status=...`

Lịch sử rút tiền.

---

## 10. Module: `payment` (PayOS)

### 10.1. `POST /api/v1/payment/checkout`

**Mô tả:** Tạo payment link qua PayOS để mua gói Pro hoặc khóa học PT.

- **Auth:** Bearer · **Authorization:** USER · **Header bắt buộc:** `Idempotency-Key`

**Request Body:**

```json
{
  "productType": "PT_COURSE",
  "productId": "crs_giam_can_30d",
  "returnUrl": "nutricoach://payment/success",
  "cancelUrl": "nutricoach://payment/cancel"
}
```

`productType` ∈ `PRO_MONTHLY | PRO_YEARLY | PT_COURSE`.

**Backend flow:**
1. Lookup giá product (vd. khóa học 1,490,000 VND).
2. Tạo internal `transactions` record (status=PENDING), sinh `orderCode` (int64 unique).
3. Gọi PayOS `paymentRequests.create({ orderCode, amount, description, items, returnUrl, cancelUrl })`.
4. Trả `checkoutUrl` + `qrCode` cho client.

**Response `201 Created`:**

```json
{
  "success": true,
  "data": {
    "transactionId": "txn_01HXYZ...",
    "orderCode": 17155954000123,
    "amountVnd": 1490000,
    "paymentLinkId": "5d8a8e6f...",
    "checkoutUrl": "https://pay.payos.vn/web/5d8a8e6f...",
    "qrCode": "00020101021238570010A00000072701270006970422...",
    "accountNumber": "9999999",
    "bin": "970422",
    "expiresAt": "2026-05-13T15:00:00.000Z"
  }
}
```

**Errors:** `404 PRODUCT_NOT_FOUND`, `409 ALREADY_PURCHASED`, `503 PAYOS_UNAVAILABLE`.

### 10.2. `POST /api/v1/payment/webhook/payos`

**Mô tả:** Endpoint nhận webhook từ PayOS khi giao dịch thay đổi trạng thái. **Public** nhưng verify signature bằng HMAC-SHA256 với `PAYOS_CHECKSUM_KEY`.

- **Auth:** Không (xác thực qua signature)
- **Authorization:** PUBLIC

**Request Body (PayOS gửi):**

```json
{
  "code": "00",
  "desc": "success",
  "success": true,
  "data": {
    "orderCode": 17155954000123,
    "amount": 1490000,
    "description": "NutriCoach PT Course",
    "accountNumber": "9999999",
    "reference": "FT23104192837465",
    "transactionDateTime": "2026-05-13 14:45:32",
    "currency": "VND",
    "paymentLinkId": "5d8a8e6f...",
    "code": "00",
    "desc": "Thành công",
    "counterAccountBankId": "970436",
    "counterAccountBankName": "Vietcombank",
    "counterAccountName": "NGUYEN VAN A",
    "counterAccountNumber": "0123456789"
  },
  "signature": "8d8640d802576397a1ce45ebda7f835055768ac7ad2e0bfb77f9b8f12cca4c7f"
}
```

**Backend flow:**
1. **Verify signature**: Sort các field trong `data` theo alphabet, build query string `key1=val1&key2=val2&...`, tính `HMAC-SHA256(queryString, PAYOS_CHECKSUM_KEY)`, so sánh với `signature` bằng `crypto.timingSafeEqual`. (Có thể dùng SDK `@payos/node` `webhooks.verify()`.)
2. **Idempotency**: Tra cứu `orderCode` + `reference`; nếu đã xử lý → trả `200 OK` ngay (PayOS có thể retry).
3. **Update transaction** status = `PAID`, lưu `reference`, `paidAt`.
4. **Side effects** theo `productType`:
   - `PRO_*`: activate subscription, set `expiresAt`.
   - `PT_COURSE`: tạo `enrollments` record, ghi nhận `pt_earnings`:
     - `grossAmount = 1,490,000`
     - `platformFee = grossAmount × 0.10 = 149,000`
     - `ptNetEarning = grossAmount × 0.90 = 1,341,000`
5. Push notification cho user + PT.

**Response `200 OK`** (luôn 2xx kể cả không nhận diện được, miễn signature valid — tránh PayOS retry vô hạn):

```json
{ "success": true, "data": { "received": true } }
```

**Errors:**
- `401 INVALID_SIGNATURE` — Signature không khớp.
- `400 MALFORMED_PAYLOAD`.

### 10.3. `GET /api/v1/payment/transactions`

Lịch sử thanh toán của user. `?page=1&limit=20&status=PAID`.

### 10.4. `GET /api/v1/payment/transactions/:id`

Chi tiết transaction.

### 10.5. `GET /api/v1/payment/subscription`

```json
{
  "success": true,
  "data": {
    "status": "ACTIVE",
    "plan": "PRO_YEARLY",
    "startedAt": "2026-01-10T00:00:00.000Z",
    "expiresAt": "2027-01-10T00:00:00.000Z",
    "autoRenew": false,
    "daysRemaining": 242
  }
}
```

### 10.6. `POST /api/v1/payment/transactions/:id/cancel`

Hủy payment link còn PENDING.

---

## 11. Module: `content`

### 11.1. `GET /api/v1/content/articles`

**Auth:** Optional · **Authorization:** PUBLIC · **Cache:** 5 phút

**Query:** `?page=1&limit=20&category=NUTRITION&tag=protein&search=`

**Item:**

```json
{
  "id": "art_01HXYZ...",
  "slug": "10-thuc-pham-giau-protein",
  "title": "10 thực phẩm giàu protein cho người tập gym",
  "excerpt": "Khám phá top 10 nguồn protein...",
  "coverImageUrl": "https://cdn.nutricoach.vn/articles/...",
  "author": { "name": "Nguyễn Y", "avatarUrl": "..." },
  "category": "NUTRITION",
  "tags": ["protein", "gym"],
  "readingTimeMin": 6,
  "publishedAt": "2026-05-10T09:00:00.000Z"
}
```

### 11.2. `GET /api/v1/content/articles/:slug`

Chi tiết bài viết, body Markdown.

### 11.3. `GET /api/v1/content/discover/pt-courses`

Khám phá khóa học PT. Filter `?specialty=WEIGHT_LOSS&maxPrice=2000000&sort=-rating&page=1`.

### 11.4. `GET /api/v1/content/pt-courses/:id`

Chi tiết khóa học (modules, instructor, reviews).

### 11.5. `GET /api/v1/content/search?q=...&type=ARTICLE|COURSE|EXERCISE`

Tìm kiếm toàn hệ thống.

---

## 12. Module: `dashboard`

### 12.1. `GET /api/v1/dashboard/user`

**Auth:** Bearer · **USER**

```json
{
  "success": true,
  "data": {
    "todayCalories": { "consumed": 1450, "target": 2124, "remaining": 674 },
    "todayMacros": { "proteinG": 95, "carbsG": 145, "fatG": 48 },
    "weeklyWorkouts": { "completed": 3, "target": 5 },
    "currentWeightKg": 72.5,
    "weightTrend7d": -0.4,
    "streakDays": 12,
    "upcomingMeals": [ { "name": "Cơm ức gà", "time": "12:30", "calories": 580 } ],
    "todayExercises": [ { "name": "Push-up 3x15", "completed": true } ]
  }
}
```

### 12.2. `GET /api/v1/dashboard/pt`

**Auth:** Bearer · **PT**

```json
{
  "success": true,
  "data": {
    "activeStudents": 28,
    "newEnrollmentsThisWeek": 3,
    "monthlyRevenueVnd": 12000000,
    "availableBalanceVnd": 28500000,
    "pendingTasks": [
      { "type": "MEAL_PLAN_REVIEW", "studentId": "usr_xxx", "deadline": "2026-05-14" }
    ],
    "studentsNeedingAttention": [
      { "studentId": "usr_xxx", "reason": "Bỏ tập 3 ngày liên tiếp" }
    ]
  }
}
```

### 12.3. `GET /api/v1/dashboard/admin`

**Auth:** Bearer · **ADMIN**

```json
{
  "success": true,
  "data": {
    "totalUsers": 24580,
    "activePtCount": 142,
    "pendingPtVerifications": 8,
    "pendingWithdrawals": { "count": 12, "totalVnd": 65000000 },
    "revenue30d": { "grossVnd": 825000000, "platformFeeVnd": 82500000 },
    "newSignups7d": 1240,
    "pendingContentReviews": 5
  }
}
```

---

## 13. Module: `upload`

### 13.1. `GET /api/v1/upload/presigned-url`

**Mô tả:** Sinh AWS S3 presigned **PUT** URL để client upload trực tiếp. TTL ngắn (5 phút) theo khuyến nghị AWS best practices.

- **Auth:** Bearer · **Authorization:** USER / PT / ADMIN

**Query Params:**
- `fileType` (required): `image/jpeg | image/png | image/webp | application/pdf | video/mp4`
- `purpose` (required): `avatar | pt-verification | course-video | course-thumbnail | scan`
- `fileSizeBytes` (optional): để backend check vs max allowed cho purpose

**Validation theo purpose:**

| purpose | Allowed MIME | Max size | TTL | Required role |
|---|---|---|---|---|
| `avatar` | image/jpeg, image/png, image/webp | 5 MB | 300s | USER/PT/ADMIN |
| `pt-verification` | image/jpeg, image/png, application/pdf | 10 MB | 300s | USER (đang submit verification) |
| `course-thumbnail` | image/jpeg, image/png, image/webp | 5 MB | 300s | PT |
| `course-video` | video/mp4 | 500 MB | 600s | PT |
| `scan` | image/jpeg, image/png, image/webp | 10 MB | 300s | USER |

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "uploadUrl": "https://nutricoach-uploads.s3.ap-southeast-1.amazonaws.com/pt-verification/usr_01HXYZ/cccd-front-7f3a.jpg?X-Amz-Algorithm=...&X-Amz-Signature=...",
    "fileKey": "pt-verification/usr_01HXYZ/cccd-front-7f3a.jpg",
    "publicUrl": "https://cdn.nutricoach.vn/pt-verification/usr_01HXYZ/cccd-front-7f3a.jpg",
    "expiresIn": 300,
    "method": "PUT",
    "headers": { "Content-Type": "image/jpeg" }
  }
}
```

**Client flow:**
1. Gọi endpoint này → nhận `uploadUrl` + `fileKey`.
2. `PUT uploadUrl` với binary body và header `Content-Type` đúng MIME đã khai báo.
3. Trên S3 thành công, gửi `fileKey` lên endpoint confirm (`/users/me/avatar`, `/pt/verification`, ...).

**S3 CORS configuration cần thiết:** Allow `PUT, GET` từ origin `https://app.nutricoach.vn` và scheme `nutricoach://`, expose header `ETag`.

**Errors:** `400 INVALID_PURPOSE`, `400 UNSUPPORTED_FILE_TYPE`, `413 FILE_TOO_LARGE`, `403 FORBIDDEN_PURPOSE` (role không đủ).

---

## 14. Module: `admin`

> Tất cả endpoint trong section này yêu cầu role `ADMIN`.

### 14.1. `GET /api/v1/admin/pt-verifications`

Danh sách hồ sơ PT chờ duyệt. `?status=PENDING_REVIEW&page=1&limit=20`.

### 14.2. `GET /api/v1/admin/pt-verifications/:id`

Chi tiết hồ sơ kèm URL ảnh CCCD/certs (signed URL có TTL).

### 14.3. `POST /api/v1/admin/pt-verifications/:id/approve`

**Body:** `{ "note": "Hồ sơ đầy đủ, chứng chỉ hợp lệ" }`. Side effect: chuyển role user `USER → PT`, gửi email thông báo.

### 14.4. `POST /api/v1/admin/pt-verifications/:id/reject`

**Body:** `{ "reason": "Ảnh CCCD mờ", "requireResubmit": true }`.

### 14.5. `GET /api/v1/admin/withdrawals?status=PENDING_APPROVAL`

Danh sách yêu cầu rút tiền.

### 14.6. `POST /api/v1/admin/withdrawals/:id/approve`

**Body:** `{ "transferReference": "FT26051300001", "note": "Đã chuyển khoản VCB" }`.

Side effect: trừ `availableBalance` của PT, ghi log audit.

### 14.7. `POST /api/v1/admin/withdrawals/:id/reject`

**Body:** `{ "reason": "Thông tin tài khoản sai" }`. Hoàn lại balance.

### 14.8. `GET /api/v1/admin/courses?status=PENDING_REVIEW`

Kiểm duyệt khóa học PT.

### 14.9. `POST /api/v1/admin/courses/:id/approve` · `/reject`

Duyệt/từ chối publish.

### 14.10. `GET /api/v1/admin/articles` · `POST /api/v1/admin/articles` · `PATCH` · `DELETE`

CRUD content cho ban biên tập.

### 14.11. `GET /api/v1/admin/users?search=&role=&page=`

Tìm/quản lý user.

### 14.12. `POST /api/v1/admin/users/:id/suspend` · `/unsuspend`

Khóa tài khoản vi phạm.

### 14.13. `GET /api/v1/admin/audit-logs`

Audit trail của các hành động admin.

---

## 15. Appendix

### 15.1. Enum Reference

| Enum | Values |
|---|---|
| `Role` | `USER`, `PT`, `ADMIN` |
| `Tier` | `FREE`, `PRO` |
| `Gender` | `MALE`, `FEMALE` |
| `ActivityLevel` | `SEDENTARY`, `LIGHT`, `MODERATE`, `ACTIVE`, `VERY_ACTIVE` |
| `Goal` | `LOSE_WEIGHT`, `MAINTAIN`, `GAIN_WEIGHT`, `GAIN_MUSCLE` |
| `MealType` | `BREAKFAST`, `LUNCH`, `DINNER`, `SNACK` |
| `SubscriptionStatus` | `ACTIVE`, `EXPIRED`, `CANCELLED`, `PENDING` |
| `TransactionStatus` | `PENDING`, `PAID`, `FAILED`, `EXPIRED`, `CANCELLED`, `REFUNDED` |
| `PTVerificationStatus` | `PENDING_REVIEW`, `APPROVED`, `REJECTED` |
| `WithdrawalStatus` | `PENDING_APPROVAL`, `APPROVED`, `REJECTED`, `COMPLETED` |
| `Difficulty` | `BEGINNER`, `INTERMEDIATE`, `ADVANCED` |
| `MuscleGroup` | `CHEST`, `BACK`, `SHOULDERS`, `BICEPS`, `TRICEPS`, `LEGS`, `GLUTES`, `CORE`, `CARDIO`, `FULL_BODY` |
| `Equipment` | `BODYWEIGHT`, `DUMBBELL`, `BARBELL`, `MACHINE`, `KETTLEBELL`, `BAND`, `CABLE` |

### 15.2. Drizzle Schema Highlights (tham khảo)

```ts
// users.ts
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }),
  googleId: varchar("google_id", { length: 255 }).unique(),
  appleId: varchar("apple_id", { length: 255 }).unique(),
  fullName: varchar("full_name", { length: 100 }).notNull(),
  role: rolEnum("role").default("USER").notNull(),
  tier: tierEnum("tier").default("FREE").notNull(),
  emailVerified: boolean("email_verified").default(false),
  onboardingCompleted: boolean("onboarding_completed").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

// foods + food_scans + food_logs + meal_plans + workouts + pt_profiles + courses
// + enrollments + transactions + withdrawals + articles ...
```

### 15.3. Background Jobs (BullMQ + Redis)

| Queue | Trigger | Job |
|---|---|---|
| `scan-upload` | sau `POST /scan` | Upload buffer lên S3 + ghi DB |
| `meal-plan-generate` | `POST /nutrition/meal-plans/generate` | Gọi OpenAI tạo plan 7 ngày |
| `email` | nhiều endpoints | Gửi email verify/reset/notification |
| `pt-payout` | webhook payment PAID | Tính & cộng `pt_earnings` |
| `cleanup-refresh-tokens` | cron daily | Xóa refresh token expired > 30 ngày |

### 15.4. Security Checklist

- [x] HTTPS only (HSTS).
- [x] JWT RS256 với key rotation hằng quý.
- [x] Refresh token hash SHA-256 trước khi lưu DB.
- [x] Family-based reuse detection.
- [x] Rate limiting per IP + per user.
- [x] Helmet middleware (X-Content-Type-Options, X-Frame-Options).
- [x] CORS whitelist domain mobile (scheme `nutricoach://`) + admin web.
- [x] Webhook signature verification dùng `crypto.timingSafeEqual`.
- [x] Idempotency-Key cho mọi endpoint tài chính.
- [x] Audit log mọi hành động ADMIN.
- [x] Soft delete user, hard delete sau 30 ngày.
- [x] PII (CCCD) lưu trên S3 với SSE-KMS, presigned URL TTL ≤ 5 phút.
- [x] Logs không ghi password / token / signature.

### 15.5. OpenAPI Specification

Phiên bản máy đọc (`openapi.yaml`) sẽ được generate từ Zod schema bằng `@asteasolutions/zod-to-openapi` và publish tại `https://api.nutricoach.vn/api/v1/docs` (Swagger UI) và `/api/v1/docs.json`. Mọi endpoint mô tả ở trên phải có Zod schema tương ứng — coi schema là source of truth, document chỉ là render.

---

**End of Document — NutriCoach API v1.0.0**