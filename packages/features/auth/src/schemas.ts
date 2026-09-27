import { z } from 'zod';

export const PasswordSchema = z.string().min(8).max(72);

export const SignInSchema = z.object({
  email: z.email(),
  password: PasswordSchema,
});

export const SignUpSchema = z
  .object({
    email: z.email(),
    password: PasswordSchema,
    confirmPassword: PasswordSchema,
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const MagicLinkSchema = z.object({
  email: z.email(),
});

export const PasswordResetRequestSchema = z.object({
  email: z.email(),
});

export const PasswordUpdateSchema = z
  .object({
    password: PasswordSchema,
    confirmPassword: PasswordSchema,
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const VerifyTotpSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
});
