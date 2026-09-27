import { describe, expect, it } from 'vitest';

import { SignInSchema, SignUpSchema } from './schemas';

describe('SignInSchema', () => {
  it('rejects an invalid email', () => {
    const result = SignInSchema.safeParse({
      email: 'not-an-email',
      password: 'supersecret',
    });

    expect(result.success).toBe(false);
  });

  it('rejects a password shorter than eight characters', () => {
    const result = SignInSchema.safeParse({
      email: 'person@example.com',
      password: 'short',
    });

    expect(result.success).toBe(false);
  });

  it('accepts a valid email and password', () => {
    const result = SignInSchema.safeParse({
      email: 'person@example.com',
      password: 'supersecret',
    });

    expect(result.success).toBe(true);
  });
});

describe('SignUpSchema', () => {
  it('rejects mismatched passwords', () => {
    const result = SignUpSchema.safeParse({
      email: 'person@example.com',
      password: 'supersecret',
      confirmPassword: 'different1',
    });

    expect(result.success).toBe(false);
  });
});
