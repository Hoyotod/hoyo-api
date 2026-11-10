-- Per-user Telegram chat ID for daily/redeem notifications.
-- Nullable so existing rows keep working (falls back to global TELEGRAM_CHAT_ID).

ALTER TABLE `user` ADD COLUMN `telegramChatId` text;
