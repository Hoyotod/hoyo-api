import { eq, lt, and, sql } from "drizzle-orm";
import type { Db } from "./db";
import { loginAttempts } from "./db/schema";

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function windowStart(timestamp = Date.now()): string {
  return new Date(Math.floor(timestamp / WINDOW_MS) * WINDOW_MS).toISOString();
}

export async function isBlocked(db: Db, identifier: string): Promise<boolean> {
  const start = windowStart();
  const result = await db
    .select({ count: loginAttempts.count })
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.identifier, identifier),
        eq(loginAttempts.windowStart, start),
      ),
    )
    .limit(1);
  return result.length > 0 && result[0].count >= MAX_FAILURES;
}

export async function recordFailure(db: Db, identifier: string): Promise<void> {
  const start = windowStart();
  const now = new Date().toISOString();
  // Requires UNIQUE(identifier, windowStart) — added in 0001_harden_schema.
  await db.run(
    sql`INSERT INTO login_attempt (identifier, windowStart, "count", updatedAt)
        VALUES (${identifier}, ${start}, 1, ${now})
        ON CONFLICT(identifier, windowStart) DO UPDATE SET
          "count" = "count" + 1,
          updatedAt = excluded.updatedAt`,
  );
  await db.delete(loginAttempts).where(lt(loginAttempts.windowStart, start));
}

export async function recordSuccess(db: Db, identifier: string): Promise<void> {
  const start = windowStart();
  const now = new Date().toISOString();
  await db.run(
    sql`UPDATE login_attempt SET "count" = 0, updatedAt = ${now}
        WHERE identifier = ${identifier} AND windowStart = ${start}`,
  );
  await db.delete(loginAttempts).where(lt(loginAttempts.windowStart, start));
}
