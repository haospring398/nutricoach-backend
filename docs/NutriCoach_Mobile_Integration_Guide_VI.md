# Hướng Dẫn Tích Hợp Mobile Frontend – NutriCoach

> **Đối tượng:** Lập trình viên mobile (iOS/Android) tích hợp với backend NutriCoach.  
> **Base URL:** `https://test-nutricoach.onrender.com/`  
> **API prefix:** `/api/v1` (tất cả endpoint trừ `/health`)  
> **Swagger UI:** `/api-docs` (toàn bộ 93 endpoint được mô tả inline)

---

## Mục Lục

1. [Quản Lý Auth Token](#1-quản-lý-auth-token)
2. [Luồng Thao Tác](#2-luồng-thao-tác)
   - [2.1 Đăng Ký & Đăng Nhập](#21-đăng-ký--đăng-nhập)
   - [2.2 Onboarding](#22-onboarding)
   - [2.3 Vòng Lặp Dinh Dưỡng Hàng Ngày](#23-vòng-lặp-dinh-dưỡng-hàng-ngày)
   - [2.4 Ghi Nhật Ký Tập Luyện](#24-ghi-nhật-ký-tập-luyện)
   - [2.5 AI Quét Thực Phẩm](#25-ai-quét-thực-phẩm)
   - [2.6 Mua Gói PRO](#26-mua-gói-pro)
   - [2.7 Mua Khóa Học PT](#27-mua-khóa-học-pt)
   - [2.8 Quest & Gamification](#28-quest--gamification)
   - [2.9 Đọc Bài Viết (Content/Articles)](#29-đọc-bài-viết-contentarticles)
3. [Tài Liệu Tham Chiếu Nhanh Từng Endpoint](#3-tài-liệu-tham-chiếu-nhanh-từng-endpoint)
   - [Auth](#auth-apiv1auth)
   - [Users](#users-apiv1users)
   - [Nutrition](#nutrition-apiv1nutrition)
   - [Foods](#foods-apiv1foods)
   - [Dashboard](#dashboard-apiv1dashboard)
   - [Payment](#payment-apiv1payment)
   - [Workout](#workout-apiv1workout)
   - [Content](#content-apiv1content)
   - [Quests](#quests-apiv1quests)
   - [Scan](#scan-apiv1scan)
4. [Mã Lỗi Thường Gặp & Cách Xử Lý](#4-mã-lỗi-thường-gặp--cách-xử-lý)
5. [Quy Ước Trường Dữ Liệu & Lưu Ý Quan Trọng](#5-quy-ước-trường-dữ-liệu--lưu-ý-quan-trọng)

---

## 1. Quản Lý Auth Token

### Các Loại Token

| Token | Thời hạn | Nơi lưu trữ | Cách sử dụng |
|---|---|---|---|
| `accessToken` | Ngắn (phút/giờ) | Bộ nhớ bảo mật / Keychain | Header `Authorization: Bearer <token>` cho mọi request cần xác thực |
| `refreshToken` | Dài (ngày/tuần) | Bộ lưu trữ bảo mật (Keychain / Keystore) | Chỉ dùng trong body của `POST /auth/refresh` |

### Cách Refresh Token

Khi bất kỳ request nào trả về `401 INVALID_TOKEN` hoặc `401 TOKEN_EXPIRED`, thực hiện luồng sau:

```
POST /api/v1/auth/refresh
Body: { "refreshToken": "<stored_refresh_token>" }

→ 200 OK: { accessToken, refreshToken }   ← lưu CẢ HAI (token refresh cũ bị vô hiệu hóa)
→ 401 INVALID_TOKEN / TOKEN_EXPIRED       ← phiên hết hạn, buộc đăng xuất về màn hình đăng nhập
```

> ⚠️ **Quan trọng:** Server phát hành `refreshToken` **mới** mỗi lần gọi refresh. Token cũ bị vô hiệu hóa ngay lập tức. Luôn thay thế cả hai token một cách nguyên tử trong storage.

### Mẫu Request (Pseudocode)

```
func apiCall(request):
  response = http(request, headers: { Authorization: "Bearer " + accessToken })

  if response.status == 401:
    refreshed = POST /auth/refresh with { refreshToken }
    if refreshed.ok:
      store(refreshed.accessToken, refreshed.refreshToken)
      retry original request once with new accessToken
    else:
      navigateToLogin()
```

### Sự Kiện Vòng Đời Token

| Sự kiện | Hiệu lực | Hành động cần thực hiện |
|---|---|---|
| `POST /auth/logout` | Refresh token của thiết bị hiện tại bị xóa | Xóa token cục bộ, chuyển đến trang đăng nhập |
| `POST /auth/logout-all` | TẤT CẢ refresh token bị xóa | Tương tự; access token hiện có hết hạn tự nhiên |
| `POST /users/me/change-password` | Tất cả refresh token bị thu hồi (trừ thiết bị hiện tại nếu truyền) | Buộc đăng nhập lại trên các thiết bị khác |
| `DELETE /users/me` | Tất cả refresh token bị xóa, tài khoản bị xóa mềm | Mọi request tiếp theo → `401 ACCOUNT_DELETED` |
| Đặt lại mật khẩu | Tất cả refresh token của người dùng bị thu hồi | Người dùng phải đăng nhập lại ở mọi nơi |

### Định Dạng Auth Header

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json
```

---

## 2. Luồng Thao Tác

### 2.1 Đăng Ký & Đăng Nhập

#### Đăng Ký Người Dùng Mới

```
1.  POST /api/v1/auth/register
      → 201: { user, accessToken, refreshToken }
      Lưu cả hai token.

2.  GET /api/v1/users/me
      → Kiểm tra onboardingCompleted (sẽ là false với người dùng mới)
      → Nếu false, chuyển hướng đến luồng Onboarding (§2.2)

3.  (Tùy chọn, chạy nền) Hiển thị thông báo xác minh email
      Email được gửi tự động khi đăng ký.
      Người dùng nhấn link → POST /auth/verify-email với token từ URL.
      Gửi lại: POST /auth/resend-verification (cần xác thực)
```

#### Đăng Nhập Người Dùng Cũ

```
1.  POST /api/v1/auth/login
      → 200: { user, accessToken, refreshToken }
      Lưu cả hai token.

2.  GET /api/v1/users/me
      → Kiểm tra onboardingCompleted
      → Nếu false → Luồng Onboarding
      → Nếu true  → Trang chủ/Dashboard
```

#### Quên Mật Khẩu

```
1.  POST /api/v1/auth/forgot-password   { email }
      → Luôn trả về 200 (an toàn khỏi liệt kê email — không thông báo email có tồn tại không)
      Hiển thị: "Nếu email của bạn tồn tại, một liên kết đặt lại đã được gửi."

2.  Người dùng nhận email, nhấn link → ứng dụng mở ra với token trong URL

3.  POST /api/v1/auth/reset-password   { token, newPassword }
      → 200: thành công
      → Buộc người dùng đăng nhập lại (server đã thu hồi tất cả phiên)
```

---

### 2.2 Onboarding

Thực hiện ngay sau lần đăng nhập đầu tiên khi `onboardingCompleted === false`.

```
1.  Thu thập từ người dùng:
      gender, dateOfBirth (YYYY-MM-DD), heightCm, weightKg,
      activityLevel, goal, targetWeightKg (tùy chọn),
      dietaryRestrictions (tùy chọn string[]), allergies (tùy chọn string[])

2.  POST /api/v1/users/me/onboarding
      → 200: { bmr, tdee, dailyCalorieTarget, macros, onboardingCompleted: true }
      Hiển thị cho người dùng các chỉ tiêu đã tính toán dưới dạng màn hình tóm tắt.

3.  Chuyển đến Trang chủ/Dashboard.
```

> Sau onboarding, luôn dùng `GET /users/me` (không phải `/auth/me`) làm lệnh gọi "tôi là ai" — nó bao gồm `metrics` (BMR, TDEE, chỉ tiêu hàng ngày, macros).

---

### 2.3 Vòng Lặp Dinh Dưỡng Hàng Ngày

Đây là luồng cốt lõi của người dùng, thường hiển thị trên màn hình trang chủ.

```
Khi mở ứng dụng / tải trang chủ:
1.  GET /api/v1/dashboard/user
      → Tiến trình calo hôm nay, phân tích macro, chuỗi ngày, mục tiêu, cấp độ.
      Sử dụng làm nguồn dữ liệu cho màn hình trang chủ.

2.  GET /api/v1/quests/daily          ← tự động trao DAILY_LOGIN trong lần gọi đầu tiên trong ngày
      → Hiển thị popup "+10 điểm!" nếu dailyLoginTriggered === true

Ghi nhật ký thực phẩm (người dùng nhấn "Ghi Thực Phẩm"):
3a. Tìm kiếm thực phẩm:  GET /api/v1/foods/search?q=<từ khóa>
      → Chọn một món từ kết quả

3b. Ghi từ danh mục:
      POST /api/v1/nutrition/food-logs
      { mealType, consumedAt, foodItemId, portionGrams }

    HOẶC ghi tùy chỉnh:
      POST /api/v1/nutrition/food-logs
      { mealType, consumedAt, customName, calories, macros: {proteinG,carbsG,fatG}, portion }

4.  Làm mới nhật ký hôm nay:
      GET /api/v1/nutrition/food-logs?date=YYYY-MM-DD
      HOẶC GET /api/v1/nutrition/summary/daily?date=YYYY-MM-DD  ← bao gồm chỉ tiêu + phần còn lại

Cuối ngày — khóa nhật ký (gamification tùy chọn):
5.  POST /api/v1/quests/diary-lock   { date: "YYYY-MM-DD" }
      → Trao PERFECT_DIARY (+30 điểm) nếu đã ghi đủ 3 bữa
      → Trao DISCIPLINE_MASTER (+50 điểm) nếu calo ≤ TDEE
      → 409 DIARY_INCOMPLETE nếu chưa ghi đủ BREAKFAST/LUNCH/DINNER

Tạo kế hoạch bữa ăn bằng AI (tính năng PRO):
6.  POST /api/v1/nutrition/meal-plans/generate   (không có body)
      → Lệnh gọi đồng bộ/chặn; sử dụng user_metrics đã lưu
      → 404 nếu chưa hoàn thành onboarding; 503 nếu dịch vụ AI bị lỗi
```

---

### 2.4 Ghi Nhật Ký Tập Luyện

```
Duyệt bài tập:
1.  GET /api/v1/workout/exercises?muscleGroup=CHEST&difficulty=BEGINNER
      → Thư viện bài tập có phân trang

2.  GET /api/v1/workout/exercises/:id   (slug, ví dụ: ex_pushup_standard)
      → Chi tiết đầy đủ: hướng dẫn, lỗi thường gặp, biến thể

Ghi phiên tập đã hoàn thành (gửi tất cả cùng lúc sau khi tập xong):
3.  POST /api/v1/workout/sessions
      {
        performedAt: ISO datetime,
        durationSec: 2700,
        logs: [
          { exerciseId: "ex_pushup_standard", orderIndex: 0, setNumber: 1, reps: 15 },
          { exerciseId: "ex_pushup_standard", orderIndex: 0, setNumber: 2, reps: 12 },
          ...
        ]
      }
      → 201: { id, name (tự tạo), caloriesBurned, totalSets, ... }

4.  Kích hoạt quest WORKOUT_DONE:
      POST /api/v1/quests/trigger
      { questId: "WORKOUT_DONE", date: "YYYY-MM-DD", referenceId: "<sessionId từ bước 3>" }

Xem lịch sử:
5.  GET /api/v1/workout/sessions?from=<ISO>&to=<ISO>
6.  GET /api/v1/workout/sessions/:id   ← chi tiết từng set
```

---

### 2.5 AI Quét Thực Phẩm

```
1.  Chụp ảnh → chuyển sang base64 (không có tiền tố data:)

2.  POST /api/v1/scan
      { imageBase64: "<raw_base64>", question: "Đây là gì?" }  // question tùy chọn
      → 200: { scanId, extraction, retrievedRows, finalAnswer, quest }
      quest.triggered === true nghĩa là quest AI_SCAN đã được trao (+20 điểm)
⚠️ AI_SCAN được backend tự kích hoạt khi POST /scan thành công.
FE không cần gọi /quests/trigger cho questId này.

3.  Hiển thị finalAnswer cho người dùng (văn bản tự do tiếng Việt từ AI)
      Hiển thị retrievedRows để ước tính calo

4.  Người dùng xác nhận → dùng dữ liệu thực phẩm để POST /nutrition/food-logs (chế độ tùy chỉnh)
```

---

### 2.6 Mua Gói PRO

```
1.  GET /api/v1/payment/subscription
      → { status, plan, expiresAt, daysRemaining }
      status: "NONE" | "ACTIVE" | "EXPIRED"

2.  Người dùng chọn PRO_MONTHLY (99.000 VNĐ) hoặc PRO_YEARLY (899.000 VNĐ)

3.  POST /api/v1/payment/checkout
      Header: Idempotency-Key: <uuid>   ← tạo phía client, lưu lại để retry
      Body: { productType: "PRO_MONTHLY" | "PRO_YEARLY" }
      → 201: { checkoutUrl, qrCode, orderCode, expiresAt }

4.  Mở checkoutUrl trong trình duyệt in-app (hoặc hiển thị mã QR)

5.  Xử lý deep link khi quay lại:
      Thành công: nutricoach://payment/success
      Hủy:       nutricoach://payment/cancel

6.  GET /api/v1/payment/subscription   ← poll hoặc kiểm tra khi quay lại
      tier trong GET /users/me → "PRO" sau khi webhook được xử lý

Lưu ý: Trạng thái thanh toán được cập nhật bởi webhook PayOS trên server.
        Ứng dụng không cần gọi bất kỳ endpoint webhook nào.
```

---

### 2.7 Mua Khóa Học PT

```
1.  GET /api/v1/content/discover/pt-courses?search=<từ khóa>
      → Duyệt các khóa học đã xuất bản

2.  GET /api/v1/content/pt-courses/:id
      → Chi tiết đầy đủ khóa học với các module + bài học

3.  POST /api/v1/payment/checkout
      Header: Idempotency-Key: <uuid>
      Body: { productType: "PT_COURSE", productId: "<courseId>" }
      → 201: { checkoutUrl, qrCode, amountVnd, ... }
      → 409 ALREADY_ENROLLED nếu người dùng đã sở hữu khóa học này

4.  Mở checkoutUrl (luồng tương tự như PRO ở trên)

5.  GET /api/v1/payment/courses   ← hiển thị khóa học đã đăng ký sau khi webhook xử lý
```

---

### 2.8 Quest & Gamification

```
Khi mở ứng dụng (mỗi ngày):
1.  GET /api/v1/quests/daily
      → Lần gọi đầu tiên trong ngày VN tự động trao DAILY_LOGIN (+10 điểm)
      → Hiển thị banner nếu dailyLoginTriggered === true

Kiểm tra tiến trình quest:
2.  Sử dụng mảng quests từ bước 1:
      isCompleted === true → hiển thị dấu tích
      todayCompletedCount / maxCompletionsPerDay → hiển thị tiến trình

Kích hoạt quest thủ công:
3.  POST /api/v1/quests/trigger
      { questId: "PT_VISIT" | "DAILY_SHARE" | "WORKOUT_DONE" | "AI_SCAN",
        date: "YYYY-MM-DD",
        referenceId: "<sessionId hoặc scanId>" }   // bắt buộc với WORKOUT_DONE + AI_SCAN
      → triggered: false nếu đã đạt giới hạn ngày (không lỗi, chỉ không có điểm)

Quest do server kích hoạt (gọi sau hành động tương ứng):
  PERFECT_DIARY + DISCIPLINE_MASTER → POST /quests/diary-lock  (xem §2.3 bước 5)

Điểm & phần thưởng:
4.  GET /api/v1/quests/points          → số dư + lịch sử nhận điểm
5.  GET /api/v1/quests/rewards         → phần thưởng có thể đổi với pointsRequired
6.  POST /api/v1/quests/redeem
      { rewardId, deliveryAddress, phone }
      → 409 INSUFFICIENT_POINTS nếu số dư < chi phí (số dư không bao giờ âm)
      → voucherCode có với phần thưởng SMALL (≤500 điểm), null với LARGE (>500 điểm)
7.  GET /api/v1/quests/redemptions     → lịch sử đổi thưởng của người dùng
```

---

### 2.9 Đọc Bài Viết (Content/Articles)

```
1.  GET /api/v1/content/categories
      → Danh sách chủ đề: [{ id, name, slug, displayOrder, articleCount }]
      → Dùng `slug` của chủ đề làm bộ lọc ở bước 2

2.  GET /api/v1/content/articles?category=<slug>&page=1&limit=20
      → Danh sách bài viết PUBLISHED (phân trang)
      → Mỗi item: title, slug, excerpt, readingTimeMin, coverImageUrl
      → Bỏ `category` để lấy tất cả; thêm `search=<từ khóa>` để tìm theo tiêu đề

3.  GET /api/v1/content/articles/:slug
      → Bài viết đầy đủ: body (Markdown), tags, viewCount
      → Render `body` bằng thư viện Markdown phía client
```

> ℹ️ Bộ lọc chủ đề dùng tham số `category` = **slug** của chủ đề (lấy từ bước 1), **không phải** `categoryId`/uuid.

---

## 3. Tài Liệu Tham Chiếu Nhanh Từng Endpoint

### Cấu Trúc Response Chung

```jsonc
// Thành công
{ "success": true, "data": <payload> }

// Thành công có phân trang
{ "success": true, "data": [...], "pagination": { "page", "limit", "totalItems", "totalPages", "hasNext", "hasPrev" } }

// Lỗi
{ "success": false, "error": { "code": "ERROR_CODE", "message": "Mô tả dễ đọc" } }

// 204 No Content → không có body
```

---

### Auth `/api/v1/auth`

#### POST `/auth/register`

| | |
|---|---|
| **Xác thực** | Không yêu cầu |

**Các trường body bắt buộc:**

| Trường | Kiểu | Ràng buộc |
|---|---|---|
| `fullName` | string | 2–100 ký tự |
| `email` | string | email hợp lệ, viết thường |
| `password` | string | tối thiểu 8 ký tự, ≥1 chữ hoa, ≥1 chữ số |

**Các trường response chính:** `data.user.id`, `data.user.tier` (`"FREE"`), `data.accessToken`, `data.refreshToken`

**Lỗi:** `400 VALIDATION_ERROR`, `409 EMAIL_EXISTS`

---

#### POST `/auth/login`

| | |
|---|---|
| **Xác thực** | Không yêu cầu |

**Các trường body bắt buộc:**

| Trường | Kiểu | Ràng buộc |
|---|---|---|
| `email` | string | email hợp lệ |
| `password` | string | tối thiểu 1 ký tự |

**Các trường response chính:** `data.user` (id, role, tier), `data.accessToken`, `data.refreshToken`

**Lỗi:** `400 VALIDATION_ERROR`, `401 INVALID_CREDENTIALS`

---

#### POST `/auth/refresh`

| | |
|---|---|
| **Xác thực** | Không yêu cầu (refresh token chính là thông tin xác thực) |

**Các trường body bắt buộc:**

| Trường | Kiểu |
|---|---|
| `refreshToken` | string |

**Các trường response chính:** `data.accessToken`, `data.refreshToken` ← **lưu cả hai, token cũ bị vô hiệu hóa**

**Lỗi:** `401 INVALID_TOKEN`, `401 TOKEN_EXPIRED`

---

#### POST `/auth/logout`

| | |
|---|---|
| **Xác thực** | Bắt buộc |

**Các trường body bắt buộc:**

| Trường | Kiểu |
|---|---|
| `refreshToken` | string |

**Response:** `200 { message: "Logged out" }`

---

#### POST `/auth/logout-all`

| | |
|---|---|
| **Xác thực** | Bắt buộc |

**Không có body.** Thu hồi TẤT CẢ phiên. **Response:** `204 No Content`

---

#### GET `/auth/me`

| | |
|---|---|
| **Xác thực** | Bắt buộc |
| **Khuyến nghị** | Dùng `GET /users/me` thay thế — bao gồm `metrics` và trạng thái onboarding |

---

#### POST `/auth/verify-email`

| | |
|---|---|
| **Xác thực** | Không yêu cầu |

**Các trường body bắt buộc:** `token` (từ URL trong email)

**Lỗi:** `400 INVALID_VERIFICATION_TOKEN`

---

#### POST `/auth/resend-verification`

| | |
|---|---|
| **Xác thực** | Bắt buộc |

**Không có body.** **Lỗi:** `400 ALREADY_VERIFIED`

---

#### POST `/auth/forgot-password`

| | |
|---|---|
| **Xác thực** | Không yêu cầu |

**Body bắt buộc:** `email`. Luôn trả về 200 bất kể email có tồn tại hay không (an toàn khỏi liệt kê).

---

#### POST `/auth/reset-password`

| | |
|---|---|
| **Xác thực** | Không yêu cầu |

**Các trường body bắt buộc:**

| Trường | Kiểu | Ràng buộc |
|---|---|---|
| `token` | string | từ email đặt lại mật khẩu |
| `newPassword` | string | tối thiểu 8 ký tự, ≥1 chữ hoa, ≥1 chữ số |

**Tác dụng phụ:** Thu hồi tất cả refresh token — người dùng phải đăng nhập lại ở mọi nơi.

**Lỗi:** `400 INVALID_RESET_TOKEN`

---

### Users `/api/v1/users`

Tất cả đều yêu cầu xác thực.

#### GET `/users/me` ⭐ "tôi là ai" chuẩn

**Không có params.**

**Các trường response chính:**

| Trường | Ghi chú |
|---|---|
| `id` | UUID người dùng |
| `role` | `"USER"` / `"PT"` / `"ADMIN"` |
| `tier` | `"FREE"` hoặc `"PRO"` |
| `onboardingCompleted` | Boolean — kiểm soát toàn bộ tính năng dựa trên trường này |
| `emailVerified` | Boolean |
| `metrics` | `null` nếu chưa onboarding; ngược lại bao gồm `bmr`, `tdee`, `dailyCalorieTarget`, `macros` |

**Lỗi:** `404 USER_NOT_FOUND`

---

#### PATCH `/users/me`

**Các trường body tùy chọn (tất cả đều tùy chọn, key lạ sẽ bị từ chối):**

| Trường | Kiểu | Ràng buộc |
|---|---|---|
| `fullName` | string | 2–100 ký tự |
| `phone` | string | định dạng `+84XXXXXXXXX` |
| `avatarUrl` | string | URL hợp lệ |
| `preferredLanguage` | string | `"vi"` hoặc `"en"` |

**Response:** Cùng cấu trúc với `GET /users/me`

---

#### POST `/users/me/onboarding`

**Các trường body bắt buộc:**

| Trường | Kiểu | Ràng buộc |
|---|---|---|
| `gender` | string | `"MALE"` hoặc `"FEMALE"` |
| `dateOfBirth` | string | `YYYY-MM-DD`, tuổi 13–100 |
| `heightCm` | integer | 100–250 |
| `weightKg` | number | 30–300 |
| `activityLevel` | string | `SEDENTARY \| LIGHT \| MODERATE \| ACTIVE \| VERY_ACTIVE` |
| `goal` | string | `LOSE_WEIGHT \| MAINTAIN \| GAIN_WEIGHT \| GAIN_MUSCLE` |

**Các trường body tùy chọn:**

| Trường | Kiểu |
|---|---|
| `targetWeightKg` | number 30–300 |
| `dietaryRestrictions` | string[] |
| `allergies` | string[] |

**Các trường response chính:** `bmr`, `tdee`, `dailyCalorieTarget`, `macros { proteinG, carbsG, fatG }`, `onboardingCompleted: true`

---

#### GET `/users/me/metrics`

**Không có params.** Trả về BMI, phân loại BMI, BMR, TDEE, chỉ tiêu hàng ngày, macros.

**Lỗi:** `404 USER_METRICS_NOT_FOUND` (chưa hoàn thành onboarding)

---

#### PATCH `/users/me/metrics`

Cập nhật sau onboarding. Yêu cầu ít nhất một trường. Tính toán lại tất cả các trường phụ thuộc.

**Các trường body tùy chọn (key lạ bị từ chối; `gender` và `dateOfBirth` không thể thay đổi):**

| Trường | Kiểu | Ràng buộc |
|---|---|---|
| `weightKg` | number | 30–300 |
| `heightCm` | integer | 100–250 |
| `activityLevel` | string | enum |
| `goal` | string | enum |
| `targetWeightKg` | number | 30–300 |
| `dietaryRestrictions` | string[] | |
| `allergies` | string[] | |

**Lỗi:** `404 USER_METRICS_NOT_FOUND`, `400 VALIDATION_ERROR`

---

#### POST `/users/me/avatar`

**Content-Type:** `multipart/form-data`

| Trường | Kiểu | Ràng buộc |
|---|---|---|
| `avatar` (form file) | file | JPEG/PNG/WebP, tối đa 5 MB |

**Response chính:** `data.avatarUrl` (URL Cloudinary ổn định — cùng URL khi tải lại)

**Lỗi:** `400 NO_FILE_PROVIDED`, `400 INVALID_FILE_TYPE`, `400 FILE_TOO_LARGE`, `500 UPLOAD_FAILED`

---

#### POST `/users/me/change-password`

**Các trường body bắt buộc:**

| Trường | Kiểu |
|---|---|
| `currentPassword` | string |
| `newPassword` | string (tối thiểu 8, ≥1 chữ hoa, ≥1 chữ số) |

**Tùy chọn:** `refreshToken` — nếu truyền, tất cả phiên NGOẠI TRỪ thiết bị này sẽ bị thu hồi.

**Response:** `204 No Content`

**Lỗi:** `401 INVALID_CURRENT_PASSWORD`

---

#### DELETE `/users/me`

**Các trường body bắt buộc:**

| Trường | Kiểu |
|---|---|
| `password` | string |

**Tùy chọn:** `reason` (tối đa 500 ký tự)

**Response:** `204 No Content`. Tài khoản bị xóa mềm — tất cả request tiếp theo sẽ thất bại với `401 ACCOUNT_DELETED`.

---

#### GET `/users/me/pt-assignments`

Kế hoạch bữa ăn và bài tập được PT giao cho học viên đã đăng ký.

**Query params tùy chọn:** `type` (`MEAL_PLAN` | `EXERCISE_ADDITION`), `page`, `limit`

---

### Nutrition `/api/v1/nutrition`

Tất cả đều yêu cầu xác thực.

#### POST `/nutrition/food-logs`

**Các trường bắt buộc dùng chung:**

| Trường | Kiểu | Ràng buộc |
|---|---|---|
| `mealType` | string | `BREAKFAST \| LUNCH \| DINNER \| SNACK` |
| `consumedAt` | string | ISO 8601 với múi giờ, ≤5 phút trong tương lai |

**Chế độ A — từ danh mục thực phẩm (chỉ chọn một chế độ):**

| Trường | Kiểu | Ràng buộc |
|---|---|---|
| `foodItemId` | string (UUID) | phải tồn tại trong danh mục |
| `portionGrams` | integer | 1–5000 |

**Chế độ B — nhập thủ công:**

| Trường | Kiểu | Ràng buộc |
|---|---|---|
| `customName` | string | 1–200 ký tự |
| `calories` | integer | 0–10000 |
| `macros.proteinG` | number | 0–500 |
| `macros.carbsG` | number | 0–2000 |
| `macros.fatG` | number | 0–500 |
| `portion` | number | 0.25–10 (hệ số nhân, không phải gram) |

**Các trường response chính:** `foodLogId`, `calories`, `macros`, `mealType`, `consumedAt`

**Lỗi:** `400 VALIDATION_ERROR` (cả hai chế độ hoặc không có), `404 FOOD_ITEM_NOT_FOUND`

---

#### GET `/nutrition/food-logs?date=YYYY-MM-DD`

**Query bắt buộc:** `date` (`YYYY-MM-DD`)

**Các trường response chính:** `data.meals` (nhóm theo loại bữa ăn), `data.totals { calories, proteinG, carbsG, fatG }`

---

#### PATCH `/nutrition/food-logs/:id`

Yêu cầu ít nhất một trường trong body. Tất cả đều tùy chọn:

`foodName`, `calories`, `proteinG`, `carbsG`, `fatG`, `portion`, `mealType`, `consumedAt`

**Lỗi:** `404 FOOD_LOG_NOT_FOUND` (bao gồm truy cập không phải chủ sở hữu)

---

#### DELETE `/nutrition/food-logs/:id`

**Response:** `204 No Content`

**Lỗi:** `404 FOOD_LOG_NOT_FOUND`

---

#### GET `/nutrition/summary/daily?date=YYYY-MM-DD`

**Query bắt buộc:** `date`

**Các trường response chính:**

| Trường | Ghi chú |
|---|---|
| `target` | `null` nếu chưa onboarding |
| `consumed` | Luôn có (bằng 0 nếu chưa ghi) |
| `remaining` | `null` nếu chưa onboarding |
| `progressPercent` | 0–100+, `null` nếu chưa onboarding |
| `meals` | Phân tích calo theo loại bữa ăn |

---

#### POST `/nutrition/meal-plans/generate`

**Không có body.** Lệnh gọi AI đồng bộ/chặn. Yêu cầu hoàn thành onboarding.

**Lỗi:** `404 USER_METRICS_NOT_FOUND`, `503 AI_SERVICE_UNAVAILABLE`

---

### Foods `/api/v1/foods`

Tất cả đều yêu cầu xác thực.

#### GET `/foods/search?q=<từ khóa>`

**Query bắt buộc:** `q` (1–100 ký tự)

**Query params tùy chọn:**

| Tham số | Kiểu |
|---|---|
| `type` | `INGREDIENT \| DISH` |
| `category` | string |
| `completeness` | `FULL \| PARTIAL \| CALORIES_ONLY` |
| `page` | integer ≥1 |
| `limit` | integer 1–50 |

**Các trường response chính mỗi mục:** `id`, `nameVi`, `nameEn`, `per100g { calories, proteinG, totalFatG, carbohydrateG }`, `dataCompleteness`

---

#### GET `/foods/categories`

**Query tùy chọn:** `type` (`INGREDIENT | DISH`)

**Response:** `[{ name, type, count }]` (cache Redis 1 giờ)

---

#### GET `/foods/:id`

Chi tiết đầy đủ của thực phẩm bao gồm vi chất dinh dưỡng.

**Lỗi:** `400 VALIDATION_ERROR` (không phải UUID), `404 FOOD_ITEM_NOT_FOUND`

---

### Dashboard `/api/v1/dashboard`

#### GET `/dashboard/user`

**Không có params.** Tổng hợp dữ liệu màn hình trang chủ cho hôm nay theo múi giờ `Asia/Ho_Chi_Minh`.

**Các trường response chính:**

| Trường | Ghi chú |
|---|---|
| `todayCalories` | `{ consumed, target, remaining, progressPercent }` — target/remaining/percent null nếu chưa onboarding |
| `todayMacros` | đã tiêu thụ + mục tiêu — target null nếu chưa onboarding |
| `mealsBreakdown` | Calo theo loại bữa ăn |
| `streakDays` | Số ngày liên tiếp (múi giờ VN) có ít nhất 1 nhật ký thực phẩm |
| `currentWeightKg` | null nếu chưa onboarding |
| `goal` | null nếu chưa onboarding |
| `tier` | `"FREE"` hoặc `"PRO"` |
| `onboardingCompleted` | Boolean |
| `upcomingMeals` | Luôn là `[]` (chưa xây dựng) |
| `weeklyWorkouts` | Luôn là `null` (chưa xây dựng) |

---

### Payment `/api/v1/payment`

#### POST `/payment/checkout`

**Header bắt buộc:** `Idempotency-Key: <uuid>` — tạo UUID phía client; cùng key trả về response đã cache (an toàn khi retry do lỗi mạng).

**Các trường body bắt buộc:**

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `productType` | string | `PRO_MONTHLY \| PRO_YEARLY \| PT_COURSE` |
| `productId` | UUID | Bắt buộc nếu `productType === "PT_COURSE"` |

**Các trường body tùy chọn:** `returnUrl`, `cancelUrl` (deep link, mặc định là `nutricoach://payment/*`)

**Các trường response chính:** `checkoutUrl`, `qrCode`, `amountVnd`, `orderCode`, `expiresAt`

**Giá:** PRO_MONTHLY = 99.000 VNĐ / 30 ngày · PRO_YEARLY = 899.000 VNĐ / 365 ngày

**Lỗi:** `404 COURSE_NOT_FOUND`, `409 ALREADY_ENROLLED`, `503 PAYOS_UNAVAILABLE`

---

#### GET `/payment/transactions`

**Query tùy chọn:** `status` (`PENDING | PAID | FAILED | EXPIRED | CANCELLED`), `page`, `limit`

---

#### GET `/payment/subscription`

**Không có params.**

**Các trường response chính:** `status` (`NONE | ACTIVE | EXPIRED`), `plan`, `expiresAt`, `daysRemaining`

---

#### GET `/payment/courses`

Các khóa học đã đăng ký (chưa hoàn tiền).

**Các trường response chính mỗi mục:** `enrollmentId`, `courseId`, `title`, `ptFullName`, `status`, `totalLessons`

---

### Workout `/api/v1/workout`

Tất cả đều yêu cầu xác thực.

#### GET `/workout/exercises`

**Query params tùy chọn:**

| Tham số | Giá trị |
|---|---|
| `muscleGroup` | `CHEST \| BACK \| SHOULDERS \| BICEPS \| TRICEPS \| LEGS \| GLUTES \| CORE \| CARDIO \| FULL_BODY` |
| `equipment` | `BODYWEIGHT \| DUMBBELL \| BARBELL \| MACHINE \| KETTLEBELL \| BAND \| CABLE \| OTHER` |
| `difficulty` | `BEGINNER \| INTERMEDIATE \| ADVANCED` |
| `search` | string |

---

#### GET `/workout/exercises/:id`

`id` là slug như `ex_pushup_standard` (không phải UUID).

**Các trường response bổ sung so với danh sách:** `instructions` (string[]), `commonMistakes` (string[]), `variations`

**Lỗi:** `404 EXERCISE_NOT_FOUND`

---

#### POST `/workout/sessions`

**Các trường body bắt buộc:**

| Trường | Kiểu | Ràng buộc |
|---|---|---|
| `performedAt` | string | ISO datetime, ≤5 phút trong tương lai |
| `logs` | array | 1–200 mục |
| `logs[].exerciseId` | string | slug |
| `logs[].orderIndex` | integer | 0–200 |
| `logs[].setNumber` | integer | 1–50 |
| `logs[].reps` HOẶC `logs[].durationSec` | integer | bắt buộc chính xác một trong hai |

**Các trường body tùy chọn:** `name`, `durationSec`, `caloriesBurned`, `notes`

**Các trường tùy chọn mỗi log:** `weightKg`, `restSec`, `rpe`, `notes`

**Các trường response chính:** `id`, `name`, `caloriesBurned`, `totalExercises`, `totalSets`

**Lỗi:** `400 VALIDATION_ERROR` (cả hai hoặc không có reps+durationSec), `404 EXERCISE_NOT_FOUND`

---

#### GET `/workout/sessions`

**Query tùy chọn:** `from`, `to` (ISO datetime), `page`, `limit`

---

#### GET `/workout/sessions/:id`

Phiên đầy đủ với mảng `logs` từng set.

---

#### PATCH `/workout/sessions/:id`

**Body tùy chọn (ít nhất một):** `name`, `notes`, `durationSec`, `caloriesBurned`

Lưu ý: Set logs không thể chỉnh sửa trong v1.

---

#### DELETE `/workout/sessions/:id`

**Response:** `204 No Content` (xóa cứng, cascade xuống logs)

---

### Content `/api/v1/content`

Tất cả đều yêu cầu xác thực.

#### GET `/content/discover/pt-courses`

**Query params tùy chọn:** `search`, `tag`, `ptId`, `maxPriceVnd`, `page`, `limit`

Chỉ trả về khóa học `PUBLISHED`. Response bao gồm thông tin PT (`bioExcerpt` = 150 ký tự đầu của bio).

---

#### GET `/content/pt-courses/:id`

Khóa học đầy đủ với các module + bài học. Trả về `404` cho khóa học chưa xuất bản.

---

#### GET `/content/articles`

**Query params tùy chọn:** `category` (slug chủ đề), `search`, `page`, `limit`

Danh sách bài viết (phân trang, mới nhất trước). Mỗi item gồm `title`, `slug`, `excerpt`, `readingTimeMin`, `coverImageUrl` (kèm `category`, `author`, `tags`, `viewCount`, `publishedAt`).

> ⚠️ Bộ lọc chủ đề dùng `category` = **slug** (lấy từ `GET /content/categories`), **không phải** `categoryId`/uuid.

---

#### GET `/content/categories`

**Không có params.** Trả về danh sách chủ đề: `[{ id, name, slug, displayOrder, articleCount }]`. Dùng `slug` để lọc bài viết ở `GET /content/articles?category=<slug>`.

---

#### GET `/content/articles/:slug`

Bài viết đầy đủ theo `slug`: `body` (Markdown thô — render phía client), `tags`, `viewCount`, kèm `category`/`author`. Mỗi lượt đọc tăng `viewCount`.

> 📌 **Chỉ bài viết `PUBLISHED` mới trả về.** Bài `DRAFT`/`ARCHIVED` bị chặn: `GET /content/articles/:slug` trả `404 ARTICLE_NOT_FOUND`, và chúng không xuất hiện trong danh sách `GET /content/articles`.

---

### Quests `/api/v1/quests`

Tất cả đều yêu cầu xác thực.

#### GET `/quests/daily`

**Không có params.** Tự động trao `DAILY_LOGIN` trong lần gọi đầu tiên của ngày VN.

**Các trường response chính:**

| Trường | Ghi chú |
|---|---|
| `dailyLoginTriggered` | Hiển thị popup "+10 điểm" nếu true |
| `totalPoints` | Số dư điểm có thể dùng hiện tại |
| `quests[].isCompleted` | Hiển thị dấu tích trong UI |
| `quests[].todayCompletedCount` | Tiến trình so với `maxCompletionsPerDay` |

---

#### POST `/quests/trigger`

**Các trường body bắt buộc:**

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `questId` | string | `AI_SCAN \| WORKOUT_DONE \| PT_VISIT \| DAILY_SHARE` (không gồm DAILY_LOGIN, PERFECT_DIARY, DISCIPLINE_MASTER) |
| `date` | string | `YYYY-MM-DD` |

**Tùy chọn:** `referenceId` — **bắt buộc** với `WORKOUT_DONE` (UUID phiên tập) và `AI_SCAN` (UUID lần quét)

**Các trường response chính:** `triggered` (false nếu đã đạt giới hạn), `pointsAwarded`, `totalPoints`

**Lỗi:** `400 REFERENCE_REQUIRED`, `400 INVALID_REFERENCE`, `404 QUEST_NOT_FOUND`

---

#### POST `/quests/diary-lock`

**Body bắt buộc:** `date` (`YYYY-MM-DD`)

**Các trường response chính:** `missionsCompleted` (mảng), `pointsAwarded`, `totalPoints`

**Lỗi:** `409 DIARY_INCOMPLETE` (chưa ghi đủ 3 bữa)

---

#### GET `/quests/points`

**Các trường response chính:** `totalPoints`, `history` (nhật ký trao điểm có phân trang)

Lưu ý: `pagination` nằm bên trong `data`, không phải bên cạnh (khác với các endpoint danh sách khác).

---

#### GET `/quests/rewards`

Phần thưởng đang hoạt động, sắp xếp theo `pointsRequired` tăng dần. Phân loại tier: SMALL ≤ 500 điểm, LARGE > 500 điểm.

---

#### POST `/quests/redeem`

**Các trường body bắt buộc:**

| Trường | Kiểu | Ràng buộc |
|---|---|---|
| `rewardId` | UUID | phải đang hoạt động |
| `deliveryAddress` | string | 5–255 ký tự |
| `phone` | string | Số di động Việt Nam (`0XXXXXXXXX` hoặc `+84XXXXXXXXX`) |

**Các trường response chính:** `redemption.voucherCode` (chỉ phần thưởng SMALL, null với LARGE), `totalPoints` (số dư sau khi trừ)

**Lỗi:** `404 REWARD_NOT_FOUND`, `409 INSUFFICIENT_POINTS`

---

#### GET `/quests/redemptions`

**Query tùy chọn:** `page`, `limit` (limit tối đa 100)

---

### Scan `/api/v1/scan`

#### POST `/scan`

**Các trường body bắt buộc:**

| Trường | Kiểu | Ràng buộc |
|---|---|---|
| `imageBase64` | string | Base64 thuần, không có tiền tố `data:`, tối thiểu 100 ký tự |

**Tùy chọn:** `question` (1–300 ký tự)

**Các trường response chính:** `scanId`, `finalAnswer` (văn bản tiếng Việt từ AI), `retrievedRows` (dữ liệu thực phẩm phù hợp), `quest.triggered`, `quest.pointsAwarded`

Lưu ý: `quest` là `null` nếu đã đạt giới hạn ngày của AI_SCAN (3 lần/ngày) — lần quét vẫn thành công.


**Lỗi:** `503 AI_SERVICE_UNAVAILABLE`

---

## 4. Mã Lỗi Thường Gặp & Cách Xử Lý

### Lỗi Auth (luôn kiểm tra trước)

| Mã | Status | Khi nào | Hành động |
|---|---|---|---|
| `UNAUTHORIZED` | 401 | Thiếu/sai auth header | Chuyển đến trang đăng nhập |
| `INVALID_TOKEN` | 401 | JWT xác minh thất bại hoặc người dùng đã xóa | Thử refresh → nếu thất bại, chuyển đến đăng nhập |
| `TOKEN_EXPIRED` | 401 | Refresh token quá `expires_at` | Chuyển đến trang đăng nhập |
| `ACCOUNT_DELETED` | 401 | Người dùng đã bị xóa mềm | Hiển thị thông báo "tài khoản đã xóa", xóa dữ liệu cục bộ |
| `INVALID_CREDENTIALS` | 401 | Sai email/mật khẩu khi đăng nhập | Hiển thị "thông tin đăng nhập không đúng" |

### Lỗi Validation

| Mã | Status | Khi nào | Hành động |
|---|---|---|---|
| `VALIDATION_ERROR` | 400 | Request không qua schema Zod | `error.message` chứa quy tắc lỗi đầu tiên — hiển thị cho người dùng |

### Lỗi Không Tìm Thấy

| Mã | Status | Tài nguyên |
|---|---|---|
| `USER_NOT_FOUND` | 404 | Người dùng (phòng thủ, hiếm gặp) |
| `USER_METRICS_NOT_FOUND` | 404 | Chưa hoàn thành onboarding — chuyển đến onboarding |
| `FOOD_ITEM_NOT_FOUND` | 404 | Mục trong danh mục thực phẩm |
| `FOOD_LOG_NOT_FOUND` | 404 | Bản ghi nhật ký (hoặc không phải chủ sở hữu) |
| `EXERCISE_NOT_FOUND` | 404 | Bài tập trong thư viện |
| `SESSION_NOT_FOUND` | 404 | Phiên tập luyện (hoặc không phải chủ sở hữu) |
| `QUEST_NOT_FOUND` | 404 | Quest không tồn tại hoặc không hoạt động |
| `REWARD_NOT_FOUND` | 404 | Phần thưởng không tồn tại hoặc không hoạt động |
| `COURSE_NOT_FOUND` | 404 | Khóa học không tồn tại hoặc chưa xuất bản |

### Lỗi Xung Đột (409)

| Mã | Khi nào | Hành động |
|---|---|---|
| `EMAIL_EXISTS` | Đăng ký với email đã tồn tại | "Email này đã được đăng ký" |
| `ALREADY_ENROLLED` | Mua khóa học đã sở hữu | Hiển thị "Bạn đã sở hữu khóa học này" |
| `INSUFFICIENT_POINTS` | Đổi thưởng khi số dư không đủ | Hiển thị số dư hiện tại |
| `DIARY_INCOMPLETE` | `diary-lock` khi chưa ghi đủ 3 bữa | Nhắc người dùng ghi bữa còn thiếu |
| `ALREADY_VERIFIED` | Gửi lại xác minh cho email đã xác minh | "Email của bạn đã được xác minh" |

### Lỗi Dịch Vụ

| Mã | Status | Khi nào | Hành động |
|---|---|---|---|
| `AI_SERVICE_UNAVAILABLE` | 503 | Microservice AI bị lỗi | Hiển thị thông báo retry |
| `PAYOS_UNAVAILABLE` | 503 | Cổng thanh toán bị lỗi | Hiển thị thông báo retry |
| `UPLOAD_FAILED` | 500 | Lỗi Cloudinary | Hiển thị thông báo retry |
| `INTERNAL_ERROR` | 500 | Lỗi server không mong đợi | Màn hình lỗi chung, ghi log để debug |

### Mẫu Xử Lý Lỗi (Pseudocode)

```
func handleError(response):
  code = response.error.code

  switch code:
    case "UNAUTHORIZED", "INVALID_TOKEN":
      tryRefreshThenRetry()
    case "TOKEN_EXPIRED":
      redirectToLogin()
    case "ACCOUNT_DELETED":
      clearLocalDataAndShowMessage()
    case "USER_METRICS_NOT_FOUND":
      navigateTo(OnboardingScreen)
    case "VALIDATION_ERROR":
      showFieldError(response.error.message)
    case "INSUFFICIENT_POINTS":
      showToast("Điểm không đủ")
    case "AI_SERVICE_UNAVAILABLE", "PAYOS_UNAVAILABLE":
      showRetryDialog()
    case "INTERNAL_ERROR":
      showGenericError()
    default:
      showToast(response.error.message)
```

---

## 5. Quy Ước Trường Dữ Liệu & Lưu Ý Quan Trọng

### Giá Trị Enum

Tất cả enum API đều viết **HOA** trong request và response, bất kể cách lưu trữ nội bộ trong DB.

| Enum | Giá trị |
|---|---|
| `mealType` | `BREAKFAST`, `LUNCH`, `DINNER`, `SNACK` |
| `activityLevel` | `SEDENTARY`, `LIGHT`, `MODERATE`, `ACTIVE`, `VERY_ACTIVE` |
| `goal` | `LOSE_WEIGHT`, `MAINTAIN`, `GAIN_WEIGHT`, `GAIN_MUSCLE` |
| `gender` | `MALE`, `FEMALE` |
| `tier` | `FREE`, `PRO` |
| `muscleGroup` | `CHEST`, `BACK`, `SHOULDERS`, `BICEPS`, `TRICEPS`, `LEGS`, `GLUTES`, `CORE`, `CARDIO`, `FULL_BODY` |
| `equipment` | `BODYWEIGHT`, `DUMBBELL`, `BARBELL`, `MACHINE`, `KETTLEBELL`, `BAND`, `CABLE`, `OTHER` |
| `difficulty` | `BEGINNER`, `INTERMEDIATE`, `ADVANCED` |

### Ngày & Giờ

- **Tất cả timestamp** trong body request/response đều theo ISO 8601.
- **`consumedAt` và `performedAt`** phải bao gồm offset múi giờ, và không được quá 5 phút trong tương lai.
- **Query params `date`** dùng định dạng `YYYY-MM-DD` (không có thành phần giờ).
- **Múi giờ Dashboard** sử dụng `Asia/Ho_Chi_Minh` — ranh giới ngày theo giờ nửa đêm VN.
- **`food_logs.consumedAt`** được lưu theo UTC — tóm tắt dinh dưỡng dùng ranh giới ngày UTC, trong khi dashboard dùng ranh giới ngày VN. Hai bên có thể lệch nhau vài giờ gần nửa đêm. Nếu hiển thị "nhật ký hôm nay" từ `/nutrition/food-logs?date=` và từ dashboard, hãy đảm bảo dùng giá trị ngày nhất quán.

### Phân Trang

Response có phân trang chuẩn có cấu trúc:

```jsonc
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalItems": 47,
    "totalPages": 3,
    "hasNext": true,
    "hasPrev": false
  }
}
```

**Ngoại lệ:** `GET /quests/points` có `pagination` bên trong `data`, không phải bên cạnh.

### Idempotency Key

`POST /payment/checkout` và `POST /pt/withdrawals` yêu cầu header `Idempotency-Key`.

- Tạo UUID v4 phía client trước khi gửi request.
- Lưu key cùng với thao tác đang chờ.
- Khi timeout mạng hoặc lỗi, retry với **cùng key** — server trả về response đã cache (`201` thành `200` khi replay).
- Key hết hạn khỏi cache sau 24 giờ.

```
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
```

### Các Trường Số

- `weightKg`, `targetWeightKg` và các cột `numeric` khác trong DB có thể trả về dạng string trong một số ngữ cảnh thô — API chuyển đổi sang số trong response, nhưng hãy cẩn thận khi lưu trữ cục bộ.
- `calories` trong food logs luôn là số nguyên.
- Giá trị macro (`proteinG`, `carbsG`, `fatG`) trong food logs là số thực (nullable trong DB nhưng được chuyển về 0 ở API boundary).

### Validation `strict()`

Nhiều endpoint dùng `.strict()` của Zod, **từ chối các key không xác định**. Chỉ gửi các trường đã được mô tả — key thừa sẽ trả về `400 VALIDATION_ERROR`.

### Endpoint Phân Quyền Theo Role

| Role | Quyền truy cập |
|---|---|
| Người dùng đã xác thực bất kỳ | Tất cả endpoint `/auth`, `/users`, `/nutrition`, `/foods`, `/dashboard`, `/workout`, `/content`, `/quests`, `/scan` |
| Chỉ role PT | `/pt/me`, `/pt/courses/*`, `/pt/students/*`, `/pt/earnings`, `/pt/withdrawals` |
| Chỉ role Admin | Tất cả endpoint `/admin/*` |

Người dùng chỉ trở thành PT sau khi nộp `/pt/verification` và được admin phê duyệt. Thay đổi role có hiệu lực từ **lần đăng nhập hoặc refresh token tiếp theo** (role trong JWT có thể lỗi thời cho đến lúc đó).

---

*Cập nhật lần cuối từ snapshot API_CURRENT.md — tham chiếu chéo với `/api-docs` để xem spec Swagger mới nhất.*
