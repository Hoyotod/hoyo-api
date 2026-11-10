import { z, type ZodType } from "zod";

// Shared server-side schemas. Routes import from here — do not duplicate
// inline schemas (previously `validation.ts` was dead code while routes
// defined their own, causing drift: e.g. missing `.trim()` on cookieToken).

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .toLowerCase()
    .email("Invalid email address")
    .max(254),
  password: z.string().min(1, "Password is required").max(128),
});

export const registerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z
    .string()
    .trim()
    .min(1)
    .toLowerCase()
    .email("Invalid email address")
    .max(254),
  password: z.string().min(8).max(128),
});

// Partial update: every field optional, but password/email changes require
// `currentPassword`. Webhook preserves value when omitted (`undefined`)
// and clears only when explicitly `null`.
export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Invalid email address")
      .max(254)
      .optional(),
    password: z.string().min(8).max(128).optional(),
    currentPassword: z.string().min(1).max(128).optional(),
    webhook: z
      .union([z.string().trim().url("Invalid webhook URL").max(2048), z.null()])
      .optional(),
    telegramChatId: z
      .union([z.string().trim().max(64), z.null()])
      .optional(),
  })
  .refine((v) => !(v.password || v.email) || !!v.currentPassword, {
    message: "currentPassword is required when changing password or email",
    path: ["currentPassword"],
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "At least one field is required",
  });

// RFC 6265 cookie-value characters: printable ASCII except separators,
// whitespace, double quote and backslash. HoYoverse tokens look like
// `v2_CAQSDGRlOG9...`; a full cookie string (`ltoken=...; ltuid=...`)
// contains a space and `;`, so it is rejected with a helpful message.
const COOKIE_VALUE_RE = /^[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]+$/;

const cookieTokenSchema = z
  .string()
  .trim()
  .min(1, "Cookie token is required")
  .max(2048)
  .regex(
    COOKIE_VALUE_RE,
    "Enter only the cookie_token_v2 value (e.g. v2_CAQSDGRlOG9...), not a full cookie string",
  );

export const accountSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  accountId: z.string().trim().min(1, "Account ID is required").max(255),
  cookieToken: cookieTokenSchema,
});

export const updateAccountSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  accountId: z.string().trim().min(1, "Account ID is required").max(255),
  cookieToken: cookieTokenSchema.optional(),
});

export type FieldErrors = Record<string, string>;

export function fieldErrors<T>(schema: ZodType<T>, data: unknown) {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true as const, data: result.data };
  }
  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const path = issue.path.join(".");
    if (path && !errors[path]) {
      errors[path] = issue.message;
    }
  }
  return { success: false as const, errors };
}
