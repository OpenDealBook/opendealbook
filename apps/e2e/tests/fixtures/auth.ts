import { faker } from '@faker-js/faker';
import { expect, type Page } from '@playwright/test';

export interface TestUser {
  email: string;
  password: string;
}

export function newCredentials(): TestUser {
  return {
    email: faker.internet.email({ provider: 'tuckin.test' }).toLowerCase(),
    password: 'password-test-1234',
  };
}

export async function signUp(page: Page, user: TestUser = newCredentials()) {
  await page.goto('/auth/sign-up');

  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByLabel('Confirm password').fill(user.password);

  await page.getByRole('button', { name: 'Sign up' }).click();

  await page.waitForURL(/\/home(\/|$)/);

  return user;
}

export async function signIn(page: Page, user: TestUser) {
  await page.goto('/auth/sign-in');

  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(user.password);

  await page.getByRole('button', { name: 'Sign in' }).click();

  await page.waitForURL(/\/home(\/|$)/);

  await expect(page).toHaveURL(/\/home(\/|$)/);
}
