import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

export const users = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: text("emailVerified"),
  // DEPRECATED: better-auth stores credentials in `account.password`.
  // Kept for backward compat; never written by `PUT /api/users/me` anymore
  // (uses `auth.api.changePassword`). Remove in a future migration.
  password: text("password"),
  image: text("image"),
  createdAt: text("createdAt").notNull(),
  updatedAt: text("updatedAt").notNull(),
  sessionVersion: integer("sessionVersion").notNull().default(0),
  webhook: text("webhook"),
  telegramChatId: text("telegramChatId"),
});

// Better-auth session table
export const sessions = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: text("expiresAt").notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ipAddress"),
    userAgent: text("userAgent"),
    createdAt: text("createdAt").notNull(),
    updatedAt: text("updatedAt").notNull(),
  },
  (t) => ({ userIdIdx: index("session_userId_idx").on(t.userId) }),
);

// Better-auth account table (for authentication methods)
export const authAccounts = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("accountId").notNull(),
    providerId: text("providerId").notNull(),
    accessToken: text("accessToken"),
    refreshToken: text("refreshToken"),
    idToken: text("idToken"),
    expiresAt: text("expiresAt"),
    password: text("password"),
    createdAt: text("createdAt").notNull(),
    updatedAt: text("updatedAt").notNull(),
  },
  (t) => ({ userIdIdx: index("account_userId_idx").on(t.userId) }),
);

// Better-auth verification table
export const verifications = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: text("expiresAt").notNull(),
    createdAt: text("createdAt"),
    updatedAt: text("updatedAt"),
  },
  (t) => ({ identifierIdx: index("verification_identifier_idx").on(t.identifier) }),
);

// Custom game accounts table (Hoyoverse accounts)
// `cookieToken` is stored as AES-GCM ciphertext (`v1:...`, see src/lib/crypto.ts).
// Uniqueness is scoped per-user: (userId, accountId) — a global unique on
// `accountId` leaked existence (oracle) and blocked two users linking the
// same Hoyo ID; per-user unique still prevents duplicates within one owner.
export const gameAccounts = sqliteTable(
  "game_account",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    accountId: text("accountId").notNull(),
    cookieToken: text("cookieToken").notNull(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: text("createdAt").notNull(),
    updatedAt: text("updatedAt").notNull(),
  },
  (table) => ({
    userIdIdx: index("game_account_userId_idx").on(table.userId),
    userAccountUnique: uniqueIndex("game_account_user_account_unique").on(
      table.userId,
      table.accountId,
    ),
  }),
);

// Per-account redemption history for the `redeem` script. A row means the
// code reached a terminal state for that game account (success, already
// claimed, or permanently invalid) and must not be attempted again.
export const redeemedCodes = sqliteTable(
  "redeemed_code",
  {
    id: text("id").primaryKey(),
    gameAccountId: text("gameAccountId")
      .notNull()
      .references(() => gameAccounts.id, { onDelete: "cascade" }),
    game: text("game").notNull(),
    code: text("code").notNull(),
    uid: text("uid"),
    status: text("status").notNull(),
    createdAt: text("createdAt").notNull(),
    updatedAt: text("updatedAt").notNull(),
  },
  (table) => ({
    accountGameCodeUnique: uniqueIndex(
      "redeemed_code_account_game_code_unique",
    ).on(table.gameAccountId, table.game, table.code),
    accountGameIdx: index("redeemed_code_account_game_idx").on(
      table.gameAccountId,
      table.game,
    ),
  }),
);

export const usersRelations = relations(users, ({ many }) => ({
  gameAccounts: many(gameAccounts),
  sessions: many(sessions),
}));

export const gameAccountsRelations = relations(gameAccounts, ({ one, many }) => ({
  user: one(users, {
    fields: [gameAccounts.userId],
    references: [users.id],
  }),
  redeemedCodes: many(redeemedCodes),
}));

export const redeemedCodesRelations = relations(redeemedCodes, ({ one }) => ({
  gameAccount: one(gameAccounts, {
    fields: [redeemedCodes.gameAccountId],
    references: [gameAccounts.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));
