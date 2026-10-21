import { z } from "zod";
import { authText } from "@/i18n/auth";

const v = authText.validation;

/** Mirrors the server rules (Better Auth: 10–128 characters). */
export const newPasswordField = z.string().min(10, v.passwordTooShort).max(128, v.passwordTooLong);

export const newPasswordSchema = z
  .object({ password: newPasswordField, confirm: z.string() })
  .refine((values) => values.password === values.confirm, { path: ["confirm"], message: v.passwordsDontMatch });
