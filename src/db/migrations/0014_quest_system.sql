-- Migration 0014: quest_system
-- Quest / gamification module: quest catalog, daily mission logs, user points.

CREATE TABLE IF NOT EXISTS "quests" (
  "id"                      varchar(64)  PRIMARY KEY,
  "title"                   varchar(200) NOT NULL,
  "description"             text         NOT NULL,
  "points_per_completion"   integer      NOT NULL,
  "max_completions_per_day" integer      NOT NULL DEFAULT 1,
  "is_active"               boolean      NOT NULL DEFAULT true,
  "created_at"              timestamp    NOT NULL DEFAULT now(),
  "updated_at"              timestamp    NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "daily_mission_logs" (
  "id"              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"         uuid        NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "quest_id"        varchar(64) NOT NULL REFERENCES "quests"("id") ON DELETE RESTRICT,
  "date"            date        NOT NULL,
  "completed_count" integer     NOT NULL DEFAULT 0,
  "points_earned"   integer     NOT NULL DEFAULT 0,
  "reference_id"    varchar(64),
  "created_at"      timestamp   NOT NULL DEFAULT now(),
  CONSTRAINT "daily_mission_logs_user_quest_date_uq" UNIQUE ("user_id", "quest_id", "date")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_points" (
  "user_id"      uuid      PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "total_points" integer   NOT NULL DEFAULT 0,
  "updated_at"   timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "daily_mission_logs_user_date_idx"
  ON "daily_mission_logs" ("user_id", "date" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_points_total_idx"
  ON "user_points" ("total_points" DESC);
--> statement-breakpoint
-- Seed quest catalog (idempotent).
INSERT INTO "quests"
  ("id", "title", "description", "points_per_completion", "max_completions_per_day", "is_active")
VALUES
  ('DAILY_LOGIN',       'Điểm danh mỗi ngày',     'Mở ứng dụng NutriCoach lần đầu tiên trong ngày.',                                   10, 1, true),
  ('AI_SCAN',           'Chuyên gia AI',          'Dùng tính năng AI Food Scanning chụp ảnh món ăn và hệ thống nhận diện thành công.', 20, 3, true),
  ('PERFECT_DIARY',     'Nhật ký hoàn hảo',       'Ghi chép đầy đủ nhật ký cho cả 3 bữa Sáng, Trưa, Tối.',                             30, 1, true),
  ('DISCIPLINE_MASTER', 'Bậc thầy Kỷ luật',       'Tổng calo nạp vào trong ngưỡng an toàn so với chỉ số TDEE.',                        50, 1, true),
  ('WORKOUT_DONE',      'Vượt qua giới hạn',      'Hoàn thành tối thiểu 1 bài tập luyện bất kỳ trong thư viện.',                       20, 1, true),
  ('PT_VISIT',          'Thăm quan gian hàng PT', 'Vào mục Kết nối PT, xem hồ sơ của 1 PT bất kỳ.',                                    10, 1, true),
  ('DAILY_SHARE',       'Lan tỏa sống khỏe',      'Chia sẻ thành tích dinh dưỡng hoặc kết quả AI ra bên ngoài.',                       30, 1, true)
ON CONFLICT ("id") DO NOTHING;
