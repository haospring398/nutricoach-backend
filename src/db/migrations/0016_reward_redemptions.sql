-- Migration 0016: reward_redemptions
-- Quest reward redemption system: rewards catalog + redemptions ledger.
-- Hand-written (CHECK constraints, enum, DESC indexes, seed rows — drizzle-kit
-- 0.20 can't express them).

CREATE TYPE "redemption_status" AS ENUM ('pending', 'fulfilled', 'rejected');
--> statement-breakpoint
CREATE TABLE "rewards" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"            varchar(200) NOT NULL,
  "description"     text NOT NULL,
  "points_required" integer NOT NULL,
  "is_active"       boolean NOT NULL DEFAULT true,
  "created_at"      timestamptz NOT NULL DEFAULT now(),
  "updated_at"      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "rewards_points_required_check" CHECK ("points_required" > 0)
);
--> statement-breakpoint
CREATE TABLE "reward_redemptions" (
  "id"                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"               uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "reward_id"             uuid NOT NULL REFERENCES "rewards"("id") ON DELETE RESTRICT,
  "reward_name"           varchar(200) NOT NULL,
  "points_cost"           integer NOT NULL,
  "delivery_address"      text NOT NULL,
  "phone"                 varchar(20) NOT NULL,
  "status"                "redemption_status" NOT NULL DEFAULT 'pending',
  "voucher_code"          varchar(32),
  "admin_note"            text,
  "redeemed_at"           timestamptz NOT NULL DEFAULT now(),
  "fulfilled_at"          timestamptz,
  "fulfilled_by_admin_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "reward_redemptions_points_cost_check" CHECK ("points_cost" >= 0)
);
--> statement-breakpoint
CREATE INDEX "reward_redemptions_user_redeemed_idx"
  ON "reward_redemptions" ("user_id", "redeemed_at" DESC);
--> statement-breakpoint
CREATE INDEX "reward_redemptions_status_redeemed_idx"
  ON "reward_redemptions" ("status", "redeemed_at" DESC);
--> statement-breakpoint
-- Seed catalog (fixed uuids so smoke tests are deterministic).
-- 3 SMALL (<= 500 pts, voucher-by-email) + 2 LARGE (> 500 pts, offline contact).
INSERT INTO "rewards" ("id", "name", "description", "points_required", "is_active") VALUES
  ('a0000000-0000-4000-8000-000000000001', 'Voucher giảm giá 10.000đ',
   'Mã giảm giá 10.000đ cho lần mua hàng tiếp theo trong ứng dụng.', 100, true),
  ('a0000000-0000-4000-8000-000000000002', 'Voucher giảm giá 30.000đ',
   'Mã giảm giá 30.000đ cho gói dịch vụ hoặc khóa học bất kỳ.', 300, true),
  ('a0000000-0000-4000-8000-000000000003', 'Voucher giảm giá 50.000đ',
   'Mã giảm giá 50.000đ áp dụng cho mọi giao dịch trong NutriCoach.', 500, true),
  ('a0000000-0000-4000-8000-000000000004', 'Buổi tư vấn PT miễn phí',
   'Một buổi tư vấn 1-1 với huấn luyện viên cá nhân. Đội ngũ sẽ liên hệ trực tiếp.', 800, true),
  ('a0000000-0000-4000-8000-000000000005', 'Gói PRO 1 tháng miễn phí',
   'Nâng cấp tài khoản lên PRO trong 1 tháng. Đội ngũ sẽ liên hệ để kích hoạt.', 1000, true);
