import { describe, expect, it } from 'vitest';

import { UpdateAccountNameSchema } from './update-account-name.schema';
import { UpdateEmailSchema } from './update-email.schema';
import { UpdatePasswordSchema } from './update-password.schema';

describe('UpdateAccountNameSchema', () => {
  it('accepts a valid name', () => {
    expect(UpdateAccountNameSchema.safeParse({ name: 'Ada' }).success).toBe(
      true,
    );
  });

  it('rejects a name shorter than two characters', () => {
    expect(UpdateAccountNameSchema.safeParse({ name: 'A' }).success).toBe(
      false,
    );
  });
});

describe('UpdateEmailSchema', () => {
  it('accepts matching emails', () => {
    expect(
      UpdateEmailSchema.safeParse({
        email: 'ada@example.com',
        repeatEmail: 'ada@example.com',
      }).success,
    ).toBe(true);
  });

  it('rejects mismatched emails', () => {
    expect(
      UpdateEmailSchema.safeParse({
        email: 'ada@example.com',
        repeatEmail: 'grace@example.com',
      }).success,
    ).toBe(false);
  });

  it('rejects an invalid email', () => {
    expect(
      UpdateEmailSchema.safeParse({
        email: 'not-an-email',
        repeatEmail: 'not-an-email',
      }).success,
    ).toBe(false);
  });
});

describe('UpdatePasswordSchema', () => {
  it('accepts matching passwords of sufficient length', () => {
    expect(
      UpdatePasswordSchema.safeParse({
        newPassword: 'password1',
        repeatPassword: 'password1',
      }).success,
    ).toBe(true);
  });

  it('rejects mismatched passwords', () => {
    expect(
      UpdatePasswordSchema.safeParse({
        newPassword: 'password1',
        repeatPassword: 'password2',
      }).success,
    ).toBe(false);
  });

  it('rejects a password shorter than eight characters', () => {
    expect(
      UpdatePasswordSchema.safeParse({
        newPassword: 'short',
        repeatPassword: 'short',
      }).success,
    ).toBe(false);
  });
});
