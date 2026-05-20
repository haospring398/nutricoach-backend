CREATE INDEX IF NOT EXISTS food_logs_user_consumed_idx
ON food_logs (user_id, consumed_at DESC);
