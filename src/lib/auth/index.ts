import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createDb } from "../db";
import * as schema from "../db/schema";
import type { Env } from "../env";

// Audit log helper — console only for now; replace with structured logging in prod.
function auditLog(event: string, data: Record<string, unknown>) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...data }));
}

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
    rateLimit: {
      enabled: true,
      storage: "database",
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 3 },
        "/change-password": { window: 60, max: 3 },
        "/change-email": { window: 60, max: 3 },
      },
    },
    advanced: {
      database: {
        validateSchema: false,
      },
      useSecureCookies: !isDev,
      ipAddress: {
        ipAddressHeaders: ["cf-connecting-ip"],
      },
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
      freshAge: 60 * 60, // Require reauth within 1h for sensitive ops
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
    databaseHooks: {
      session: {
        create: {
          after: async ({ data }) => {
            const d = data as { userId: string; id: string };
            auditLog("session.created", { userId: d.userId, sessionId: d.id });
          },
        },
        delete: {
          after: async ({ data }) => {
            const d = data as { id: string };
            auditLog("session.revoked", { sessionId: d.id });
          },
        },
      },
      user: {
        update: {
          after: async ({ data, oldData }) => {
            const d = data as { id: string; email: string };
            const o = oldData as { email?: string } | undefined;
            if (o?.email !== d.email) {
              auditLog("user.email_changed", { userId: d.id, oldEmail: o?.email, newEmail: d.email });
            }
          },
        },
      },
    },
  });
};

export type Auth = ReturnType<typeof betterAuth>;
