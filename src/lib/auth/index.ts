import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createDb } from "../db";
import * as schema from "../db/schema";
import type { Env } from "../env";

export const initAuth = (env: Env) => {
  const db = createDb(env.DB);
  const isDev =
    !env.BETTER_AUTH_URL ||
    env.BETTER_AUTH_URL.includes("localhost") ||
    env.BETTER_AUTH_URL.includes("127.0.0.1");

  // Localhost origins only in dev — prod must not trust dev origins.
  const trustedOrigins = isDev
    ? [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
      ]
    : [];

  const prodOrigins = [
    "https://hoyo.haiueom.workers.dev",
    "https://hoyo-api.haiueom.workers.dev",
    "https://hoyo-web.haiueom.workers.dev",
    "https://hoyo.pages.dev",
    "https://hoyo.haiueom.pages.dev",
  ];

  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [...trustedOrigins, ...prodOrigins],
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
      useSecureCookies: !isDev,
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      minPasswordLength: 8,
      maxPasswordLength: 128,
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
      changeEmail: {
        enabled: true,
        // No email verification — email changes apply immediately.
        updateEmailWithoutVerification: true,
      },
    },
  });
};

export type Auth = ReturnType<typeof betterAuth>;
