-- Security hardening migration (audit fixes):
-- 1. Drop global UNIQUE on game_account.accountId (enumeration oracle, SEC-06)
--    -> replace with per-user UNIQUE(userId, accountId)
-- 2. Add missing lookup indexes (sessions/accounts/verifications)
-- 3. Add UNIQUE(identifier, windowStart) required by rate-limit ON CONFLICT
--    (login_attempt previously had no PK/unique, SEC-04)

DROP INDEX IF EXISTS `game_account_accountId_unique`;
--> statement-breakpoint
CREATE UNIQUE INDEX `game_account_user_account_unique` ON `game_account` (`userId`, `accountId`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `session_userId_idx` ON `session` (`userId`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `account_userId_idx` ON `account` (`userId`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `verification_identifier_idx` ON `verification` (`identifier`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `login_attempt_identifier_window_unique` ON `login_attempt` (`identifier`, `windowStart`);
