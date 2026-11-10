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

export const loginAttempts = sqliteTable(
  "login_attempt",
  {
    identifier: text("identifier").notNull(),
    windowStart: text("windowStart").notNull(),
    count: integer("count").notNull().default(0),
    updatedAt: text("updatedAt").notNull(),
  },
  (t) => ({
    identifierWindowUnique: uniqueIndex("login_attempt_identifier_window_unique").on(
      t.identifier,
      t.windowStart,
    ),
  }),
);

export const usersRelations = relations(users, ({ many }) => ({
  gameAccounts: many(gameAccounts),
  sessions: many(sessions),
}));

export const gameAccountsRelations = relations(gameAccounts, ({ one }) => ({
  user: one(users, {
    fields: [gameAccounts.userId],
    references: [users.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));
