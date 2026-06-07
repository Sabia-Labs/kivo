import { z } from "zod";

export const signupSchema = z.object({
  email: z.string().email("Invalid email"),
  workspaceName: z.string().min(1, "Workspace name is required"),
  code: z.string().length(4, "OTP code must be 4 digits"),
  language: z.string().optional(),
});

export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.string().email("Invalid email"),
  code: z.string().length(4, "OTP code must be 4 digits"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const otpSendSchema = z.object({
  email: z.string().email("Invalid email"),
});

export type OtpSendInput = z.infer<typeof otpSendSchema>;
