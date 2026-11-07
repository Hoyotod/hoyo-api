import { z, type ZodType } from "zod";

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .toLowerCase()
    .email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const registerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name is too long"),
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .toLowerCase()
    .email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name is too long"),
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .toLowerCase()
    .email("Invalid email address"),
  password: z
    .union([z.literal(""), z.string().min(8, "Password must be at least 8 characters")])
    .optional(),
  webhook: z
    .union([z.literal(""), z.string().trim().url("Invalid webhook URL")])
    .optional()
    .transform((v) => (v === "" ? null : v)),
});

export const accountSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name is too long"),
  accountId: z.string().trim().min(1, "Account ID is required"),
  cookieToken: z.string().trim().min(1, "Cookie token is required"),
});

export const updateAccountSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name is too long"),
  accountId: z.string().trim().min(1, "Account ID is required"),
  cookieToken: z.string().trim().nullish(),
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
