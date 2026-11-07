import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createDb } from "../db";
import * as schema from "../db/schema";
import type { Env } from "../env";

export const initAuth = (env: Env) => {
  const db = createDb(env.DB);

  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "https://hoyo.haiueom.workers.dev",
      "https://hoyo-api.haiueom.workers.dev",
      "https://hoyo-web.haiueom.workers.dev",
      "https://hoyo.pages.dev",
      "https://hoyo.haiueom.pages.dev",
    ],
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.authAccounts,
        verification: schema.verifications,
      },
    }),
    secret: env.BETTER_AUTH_SECRET,
    advanced: {
      database: {
        validateSchema: false,
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    user: {
      additionalFields: {
        sessionVersion: {
          type: "number",
          required: false,
          defaultValue: 0,
        },
        webhook: {
          type: "string",
          required: false,
        },
      },
    },
  });
};

export type Auth = ReturnType<typeof betterAuth>;
