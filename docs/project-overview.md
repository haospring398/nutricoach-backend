# Project Overview — NutriCoach Backend

> Sinh bởi `bmad-document-project` (exhaustive scan, 2026-06-18).

## Mục đích

**NutriCoach** là REST API backend cho ứng dụng mobile dinh dưỡng + thể hình tại Việt Nam. Phục vụ người dùng cuối (theo dõi ăn uống, tập luyện, gamification), PT/personal-trainer (marketplace khóa học + quản lý học viên + thu nhập), và admin (kiểm duyệt, quản lý user, analytics).

## Phạm vi chức năng

| Domain | Chức năng |
|---|---|
| **Auth** | Đăng ký/đăng nhập (JWT), email verify, reset password, refresh token |
| **Onboarding** | Body metrics → tính BMR/TDEE/macro targets |
| **Nutrition** | Food log (manual + catalog VN NIN), tổng kết ngày, AI meal-plan |
| **AI Food Scan** | Ảnh món ăn → Gemini extract → match catalog → log |
| **Foods** | Catalog ~2,100 món (trigram search) |
| **Workout** | Thư viện ~40 bài tập + nhật ký buổi tập/sets |
| **Gamification** | 7 quest hằng ngày, điểm, đổi thưởng (rewards) |
| **Payment** | PRO subscription (PayOS), mua khóa PT, webhook |
| **PT marketplace** | Verification → courses → enrollment → student mgmt → earnings/withdrawals |
| **Content** | Bài viết (articles) + discover khóa PT |
| **Admin** | PT review, duyệt rút tiền, quản lý article/quest/reward, ban user, analytics |

## Executive summary

- **Loại:** backend REST API monolith.
- **Quy mô:** 95 file TS (~20k LOC), 106 route handlers / 12 module, 27 bảng / 19 migration.
- **Trạng thái:** PT marketplace feature-complete (Phase 1–4). Mới nhất: PT media upload Cloudinary (0018) + course-media public_id cho replace/compensating-delete (0019) + upload hardening (magic-byte anti-spoof, video disk/timeout).
- **AI:** tách riêng microservice (Gemini 2.5 Flash, LangGraph/ESM, port 4000), backend gọi qua HTTP.

## Tech stack (tóm tắt)

Node ≥18 · TypeScript 5.9 (strict) · Express 4 · PostgreSQL/Drizzle 0.29 · Redis/ioredis · Zod · JWT(HS256)+bcrypt · PayOS · Cloudinary · Resend · Swagger.
Chi tiết: [architecture.md §2](./architecture.md).

## Cấu trúc repo

- **Repository type:** monolith (single part).
- **Kiến trúc:** Layer-based MVC — `routes → controllers → services → models`.
- Chi tiết cây thư mục: [source-tree-analysis.md](./source-tree-analysis.md).

## Liên kết tài liệu

| Tài liệu | Nội dung |
|---|---|
| [index.md](./index.md) | ⭐ Điểm vào chính (master index) |
| [architecture.md](./architecture.md) | Kiến trúc, conventions, security, integration |
| [data-models.md](./data-models.md) | Schema DB 27 bảng |
| [api-contracts.md](./api-contracts.md) | Catalog 106 endpoint |
| [source-tree-analysis.md](./source-tree-analysis.md) | Cây thư mục chú thích |
| [development-guide.md](./development-guide.md) | Setup dev, scripts, quy trình thêm module |
| [deployment-guide.md](./deployment-guide.md) | Deploy (Neon) |
| [CODEBASE_CONTEXT.md](./CODEBASE_CONTEXT.md) | Onboarding map chi tiết (đã có) |
| [API_CURRENT.md](./API_CURRENT.md) | Đặc tả API đầy đủ (đã có) |
| [NutriCoach_Mobile_Integration_Guide_VI.md](./NutriCoach_Mobile_Integration_Guide_VI.md) | Guide tích hợp mobile (đã có) |
