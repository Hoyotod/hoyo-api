-- Per-account redemption history used by the `redeem` script.
-- Hand-written because drizzle/meta only contains the 0000 snapshot
-- (0001/0002 were written without snapshots, so `db:generate` would emit
-- unrelated drift).

CREATE TABLE `redeemed_code` (
	`id` text PRIMARY KEY NOT NULL,
	`gameAccountId` text NOT NULL,
	`game` text NOT NULL,
	`code` text NOT NULL,
	`uid` text,
	`status` text NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	FOREIGN KEY (`gameAccountId`) REFERENCES `game_account`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `redeemed_code_account_game_code_unique` ON `redeemed_code` (`gameAccountId`,`game`,`code`);
--> statement-breakpoint
CREATE INDEX `redeemed_code_account_game_idx` ON `redeemed_code` (`gameAccountId`,`game`);
