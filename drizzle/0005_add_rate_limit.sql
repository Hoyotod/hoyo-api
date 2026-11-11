-- better-auth rate limiter storage (`rateLimit.storage: "database"`).
-- Without this table every auth request fails once the limiter persists a hit.
CREATE TABLE IF NOT EXISTS `rate_limit` (
  `id` text PRIMARY KEY NOT NULL,
  `key` text NOT NULL UNIQUE,
  `count` integer NOT NULL,
  `lastRequest` integer NOT NULL
);
CREATE INDEX IF NOT EXISTS `rate_limit_lastRequest_idx` ON `rate_limit` (`lastRequest`);
