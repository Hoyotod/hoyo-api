import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  driver: "d1-http",
  tablesFilter: [
    "user",
    "session",
    "account",
    "verification",
    "rate_limit",
    "game_account",
    "redeemed_code",
  ],
});
