# NutriCoach Backend — Documentation Index

> ⭐ **Điểm vào chính cho AI-assisted development.** Sinh bởi `bmad-document-project` (exhaustive scan, 2026-06-18).

## Project Overview

- **Type:** monolith — backend REST API
- **Primary Language:** TypeScript 5.9 (strict, ES2022, commonjs)
- **Architecture:** Layer-based MVC (`routes → controllers → services → models`)

## Quick Reference

- **Tech Stack:** Node ≥18 · Express 4 · PostgreSQL/Drizzle 0.29 · Redis/ioredis · Zod · JWT(HS256)+bcrypt · PayOS · Cloudinary · Resend · Swagger
- **Entry Point:** [src/server.ts](../src/server.ts) → [src/app.ts](../src/app.ts)
- **Quy mô:** 96 file TS (~20k LOC) · 109 endpoint / 12 module · 27 bảng / 21 migration (0000–0020)
- **AI:** microservice riêng (Gemini 2.5 Flash, LangGraph/ESM, port 4000) — gọi qua HTTP
- **Trạng thái:** PT marketplace feature-complete (Phase 1–4); admin user-mgmt (0017) + PT media upload (0018) + course-media public_id & upload hardening (0019)

## Generated Documentation

- [Project Overview](./project-overview.md)
- [Architecture](./architecture.md)
- [Source Tree Analysis](./source-tree-analysis.md)
- [Development Guide](./development-guide.md)
- [Deployment Guide](./deployment-guide.md)
- [API Contracts](./api-contracts.md)
- [Data Models](./data-models.md)

## Existing Documentation (đã có từ trước — không ghi đè)

- [CODEBASE_CONTEXT.md](./CODEBASE_CONTEXT.md) — Onboarding map chi tiết (English): folder, 27+ tables, enums, conventions, payment webhook
- [API_CURRENT.md](./API_CURRENT.md) — Đặc tả API đầy đủ (request/response schema + ví dụ)
- [API_SPEC_v1.1.md](./API_SPEC_v1.1.md) — Spec API phiên bản cũ hơn (tham khảo lịch sử)
- [DEPLOYMENT.md](./DEPLOYMENT.md) — Hướng dẫn deploy Neon (⚠️ vài chỗ cũ — xem [deployment-guide.md](./deployment-guide.md) để đính chính)
- [NutriCoach_Mobile_Integration_Guide_VI.md](./NutriCoach_Mobile_Integration_Guide_VI.md) — Guide tích hợp cho mobile
- [project-context.md](../_bmad-output/project-context.md) — Quy tắc cho AI agent (28 rules: TS/architecture/migration/security)

## Getting Started

```bash
npm install
cp .env.example .env        # điền giá trị (xem development-guide.md)
npm run db:migrate          # tạo bảng (0000–0020)
npm run seed:foods && npm run seed:exercises
npm run dev                 # http://localhost:3000
curl http://localhost:3000/health
```

- **API docs (live):** `http://localhost:3000/api-docs` (Swagger UI) · `/api-docs.json` (raw spec)
- **Quy trình thêm module:** xem [development-guide.md](./development-guide.md)

## Cho AI agent

Đọc theo thứ tự khi onboard task mới:
1. [project-context.md](../_bmad-output/project-context.md) — quy tắc bắt buộc (override mọi default)
2. [architecture.md](./architecture.md) — conventions, layer, envelope, enum casing
3. [data-models.md](./data-models.md) + [api-contracts.md](./api-contracts.md) — bề mặt DB/API
4. [CODEBASE_CONTEXT.md](./CODEBASE_CONTEXT.md) — chi tiết sâu khi cần
