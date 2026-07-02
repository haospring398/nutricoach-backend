# API Contracts — NutriCoach Backend

> Catalog endpoint cấp cao. Sinh bởi `bmad-document-project` (exhaustive scan, 2026-06-18).
> **Schema request/response đầy đủ** + ví dụ: xem [API_CURRENT.md](./API_CURRENT.md) (đặc tả chi tiết) và **Swagger live** tại `/api-docs` (UI) + `/api-docs.json` (raw spec).
> Nguồn của catalog này: các file `src/routes/*.routes.ts`.

## Quy ước chung

- **Base path:** mọi endpoint dưới `/api/v1`. Ngoài ra `GET /health` (không auth, không envelope) định nghĩa tại [app.ts](../src/app.ts).
- **Response envelope (BẮT BUỘC):**
  - Success: `{ "success": true, "data": <payload> }`
  - List phân trang: `{ "success": true, "data": [...], "pagination": { page, limit, totalItems, totalPages, hasNext, hasPrev } }`
  - Error: `{ "success": false, "error": { "code": "SCREAMING_SNAKE", "message": "..." } }` (đôi khi có `error.details`)
  - `204 No Content` → không body. Ngoại lệ envelope duy nhất: PayOS webhook (`{ "received": true, ... }`).
- **Auth:** `Authorization: Bearer <accessToken>` (JWT HS256). Xem cột Auth từng bảng.
- **Enum:** API luôn trả **UPPERCASE** (xem [data-models.md](./data-models.md)).
- **Idempotency:** `POST /payment/checkout` và `POST /pt/withdrawals` nhận header `Idempotency-Key` (Redis 24h TTL + DB unique làm safety net). First call → 201, replay → 200.

**Tổng: 110 route handlers** (`router.METHOD(...)` đếm trực tiếp từ `src/routes/*`, chưa kể `GET /health`). `/admin` mang 33 handler thuộc nhiều module con. Phân theo mount:

---

## `/auth` — [auth.routes.ts](../src/routes/auth.routes.ts) (10)

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| POST | `/auth/register` | public | Đăng ký |
| POST | `/auth/login` | public | Đăng nhập → access + refresh token |
| POST | `/auth/refresh` | public | Đổi refresh token lấy access mới |
| POST | `/auth/logout` | auth | Thu hồi refresh token hiện tại |
| POST | `/auth/logout-all` | auth | Thu hồi mọi refresh token (204) |
| GET | `/auth/me` | auth | Thông tin user hiện tại |
| POST | `/auth/verify-email` | public | Xác thực email (token Redis) |
| POST | `/auth/resend-verification` | auth | Gửi lại email xác thực |
| POST | `/auth/forgot-password` | public | Gửi email reset password |
| POST | `/auth/reset-password` | public | Đặt lại mật khẩu (token Redis) |

## `/users` — [users.routes.ts](../src/routes/users.routes.ts) (9)

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| GET | `/users/me` | auth | Profile |
| PATCH | `/users/me` | auth | Cập nhật profile |
| POST | `/users/me/onboarding` | auth | Hoàn tất onboarding (tính BMR/TDEE/macro) |
| GET | `/users/me/metrics` | auth | Lấy body metrics |
| PATCH | `/users/me/metrics` | auth | Cập nhật + recompute BMR/TDEE/macro/BMI |
| POST | `/users/me/change-password` | auth | Đổi mật khẩu (204) |
| DELETE | `/users/me` | auth | Soft delete tài khoản (204) |
| GET | `/users/me/pt-assignments` | auth | Bài tập/meal-plan PT giao |
| POST | `/users/me/avatar` | auth | Upload avatar (Cloudinary, multer 5MB) |

## `/nutrition` — [nutrition.routes.ts](../src/routes/nutrition.routes.ts) (7)

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| POST | `/nutrition/food-logs` | auth | Tạo food log (Mode A catalog / Mode B manual) |
| GET | `/nutrition/food-logs` | auth | Danh sách food log |
| PATCH | `/nutrition/food-logs/:id` | auth | Sửa food log |
| DELETE | `/nutrition/food-logs/:id` | auth | Xóa food log |
| GET | `/nutrition/summary/daily` | auth | Tổng kết dinh dưỡng theo ngày |
| POST | `/nutrition/meal-plans/generate` | auth | Sinh meal plan (gọi AI `/plan`, retry, lưu `meal_plans` — upsert) |
| GET | `/nutrition/meal-plans` | auth | Lấy meal plan đã lưu gần nhất (404 nếu chưa có) |

## `/foods` — [foods.routes.ts](../src/routes/foods.routes.ts) (3)

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| GET | `/foods/search` | auth | Tìm món (trigram similarity VN NIN) |
| GET | `/foods/categories` | auth | Danh mục thực phẩm |
| GET | `/foods/:id` | auth | Chi tiết món |

## `/dashboard` — [dashboard.routes.ts](../src/routes/dashboard.routes.ts) (1)

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| GET | `/dashboard/user` | auth | Dashboard tổng hợp (calo, quest, streak…) |

## `/payment` — [payment.routes.ts](../src/routes/payment.routes.ts) (5)

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| POST | `/payment/checkout` | auth + Idempotency-Key | Tạo link thanh toán PayOS |
| POST | `/payment/webhook/payos` | **public (signature)** | Webhook PayOS (verify từ rawBody) |
| GET | `/payment/transactions` | auth | Lịch sử giao dịch |
| GET | `/payment/subscription` | auth | Subscription hiện tại |
| GET | `/payment/courses` | auth | Khóa học user đã mua |

## `/workout` — [workout.routes.ts](../src/routes/workout.routes.ts) (7)

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| GET | `/workout/exercises` | auth | Thư viện bài tập (filter) |
| GET | `/workout/exercises/:id` | auth | Chi tiết bài tập |
| POST | `/workout/sessions` | auth | Ghi buổi tập + sets |
| GET | `/workout/sessions` | auth | Danh sách buổi tập |
| GET | `/workout/sessions/:id` | auth | Chi tiết buổi tập |
| PATCH | `/workout/sessions/:id` | auth | Sửa buổi tập |
| DELETE | `/workout/sessions/:id` | auth | Xóa buổi tập |

## `/pt` — [pt.routes.ts](../src/routes/pt.routes.ts) (22)

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| POST | `/pt/verification` | auth | Nộp đơn xác thực PT |
| GET | `/pt/verification/status` | auth | Trạng thái đơn |
| GET | `/pt/me` | role:pt | Profile PT |
| PATCH | `/pt/me` | role:pt | Cập nhật profile/bank PT |
| POST | `/pt/courses` | role:pt | Tạo khóa học |
| GET | `/pt/courses` | role:pt | Danh sách khóa của PT |
| GET | `/pt/courses/:id` | role:pt | Chi tiết khóa (kèm curriculum) |
| PATCH | `/pt/courses/:id` | role:pt | Sửa metadata khóa |
| PUT | `/pt/courses/:id/curriculum` | role:pt | Thay toàn bộ modules/lessons |
| POST | `/pt/courses/:id/publish` | role:pt | Publish (validate curriculum đủ) |
| POST | `/pt/courses/:id/archive` | role:pt | Archive khóa |
| POST | `/pt/courses/:id/restore` | role:pt | Khôi phục khóa đã thu hồi (archived → draft) |
| POST | `/pt/courses/:id/thumbnail` | role:pt | Upload thumbnail (Cloudinary) |
| POST | `/pt/courses/:id/lessons/:lessonId/video` | role:pt | Upload video lesson (Cloudinary MP4 100MB) |
| PATCH | `/pt/courses/:id/lessons/:lessonId/preview` | role:pt | Bật/tắt cờ xem thử (is_preview) cho lesson |
| GET | `/pt/students` | role:pt | Danh sách học viên |
| GET | `/pt/students/:studentId` | role:pt + ptAccess | Chi tiết học viên |
| PUT | `/pt/students/:studentId/meal-plan` | role:pt + ptAccess | Giao meal plan |
| POST | `/pt/students/:studentId/exercises` | role:pt + ptAccess | Thêm bài tập |
| GET | `/pt/earnings` | role:pt | Sổ thu nhập + balance |
| POST | `/pt/withdrawals` | role:pt + Idempotency-Key | Yêu cầu rút tiền |
| GET | `/pt/withdrawals` | role:pt | Lịch sử rút tiền |

> Lưu ý: đúng **22** `router.METHOD` (đã verify từ `pt.routes.ts`) — gồm cả nhánh `courses/:id/*` và `students/:studentId/*`.

## `/content` — [content.routes.ts](../src/routes/content.routes.ts) (5)

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| GET | `/content/discover/pt-courses` | auth | Khám phá khóa PT (published) |
| GET | `/content/pt-courses/:id` | auth | Chi tiết khóa PT công khai |
| GET | `/content/articles` | auth | Danh sách bài viết (published) |
| GET | `/content/categories` | auth | Danh mục bài viết |
| GET | `/content/articles/:slug` | auth | Chi tiết bài viết (theo slug) |

## `/quests` — [quest.routes.ts](../src/routes/quest.routes.ts) (7)

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| GET | `/quests/daily` | auth | Quest hôm nay + tiến độ |
| POST | `/quests/trigger` | auth | Trigger hoàn thành quest (server-verified) |
| POST | `/quests/diary-lock` | auth | Khóa nhật ký ngày (quest PERFECT_DIARY) |
| GET | `/quests/points` | auth | Số dư điểm |
| GET | `/quests/rewards` | auth | Catalog phần thưởng |
| POST | `/quests/redeem` | auth | Đổi thưởng (trừ điểm atomic) |
| GET | `/quests/redemptions` | auth | Lịch sử đổi thưởng |

## `/scan` — [scan.routes.ts](../src/routes/scan.routes.ts) (1)

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| POST | `/scan` | auth | AI food scan — upload ảnh `multipart/form-data` (field `image`) → AI `/scan`; trả kết quả có cấu trúc; FREE giới hạn 3 lần/ngày |

## `/admin` — [admin.routes.ts](../src/routes/admin.routes.ts) (33 — role:admin router-wide)

**PT review (7):**
`GET /admin/pt-verifications` · `GET /admin/pt-verifications/:id` · `POST .../:id/approve` · `POST .../:id/reject` · `GET /admin/withdrawals` · `POST /admin/withdrawals/:id/approve` · `POST .../:id/reject`

**Articles / content write (9):**
`POST /admin/articles/upload-image` · `GET /admin/articles` · `POST /admin/articles` · `GET /admin/articles/:id` · `PATCH /admin/articles/:id` · `POST .../:id/publish` · `POST .../:id/archive` · `POST .../:id/restore` · `POST /admin/categories`

**Quests admin (11):**
`GET /admin/quests` · `POST /admin/quests` · `PATCH /admin/quests/:id` · `GET /admin/quests/leaderboard` · `GET /admin/quests/redemptions` · `PATCH /admin/quests/redemptions/:id/fulfill` · `PATCH .../:id/reject` · `GET /admin/quests/rewards` · `POST /admin/quests/rewards` · `PATCH /admin/quests/rewards/:id` · `DELETE /admin/quests/rewards/:id`

**User management (6 — migration 0017):**
`GET /admin/users` · `GET /admin/users/:id` · `POST /admin/users/:id/ban` · `POST /admin/users/:id/unban` · `PATCH /admin/users/:id/role` · `GET /admin/analytics/users`

---

## Auth requirements (tóm tắt)

- **Public:** auth register/login/refresh/verify-email/forgot-password/reset-password; `POST /payment/webhook/payos` (verify PayOS signature).
- **`authenticate` only:** users, nutrition, foods, dashboard, workout, content, quests; payment (trừ webhook); pt verification + verification/status.
- **+ `requireRole('pt')`:** `/pt/me`, `/pt/courses/*`, `/pt/students/*`, `/pt/earnings`, `/pt/withdrawals`. Route `students/:studentId/*` thêm `requirePtAccessToStudent` (404-not-403).
- **+ `requireRole('admin')` (router-wide):** toàn bộ `/admin/*`.

> JWT mang `role` nên có thể **stale** sau khi đổi role (vd admin duyệt PT) cho đến khi user re-login/refresh.
