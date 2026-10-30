import { faker } from '@faker-js/faker';
import { expect, type Page } from '@playwright/test';

import type { Cleanup } from './cleanup';
import { firstLink, waitForMessage } from './mail';

export interface TestUser {
  email: string;
  password: string;
}

export function newCredentials(): TestUser {
  return {
    email: faker.internet.email({ provider: 'opendealbook.test' }).toLowerCase(),
    password: 'password-test-1234',
  };
}

export function createAuth(cleanup: Cleanup) {
  return {
    async signUp(
      page: Page,
      user: TestUser = newCredentials(),
    ): Promise<TestUser> {
      await page.goto('/auth/sign-up');
      await page.getByLabel('Email').fill(user.email);
      await page.getByLabel('Password', { exact: true }).fill(user.password);
      await page.getByLabel('Confirm password').fill(user.password);
      await page.getByRole('button', { name: 'Sign up' }).click();
      cleanup.track({ kind: 'user', email: user.email });

      const confirmation = await waitForMessage({
        to: user.email,
        subject: /confirm/i,
      });
      await page.goto(firstLink(confirmation, /\/auth\/v1\/verify/));

      // A fresh account is not onboarded, so /home bounces to /onboarding.
      await page.waitForURL(/\/(home|onboarding)(\/|$)/);

      return user;
    },

    async signIn(page: Page, user: TestUser) {
      await page.goto('/auth/sign-in');
      await page.getByLabel('Email').fill(user.email);
      await page.getByLabel('Password', { exact: true }).fill(user.password);
      await page.getByRole('button', { name: 'Sign in' }).click();
      await page.waitForURL(/\/(home|onboarding)(\/|$)/);
    },

    async signOut(page: Page, user: TestUser) {
      await page.goto('/home/settings');
      await page
        .getByRole('button', {
          name: `Account menu for ${user.email}`,
          exact: true,
        })
        .click();
      await page.getByRole('menuitem', { name: 'Sign out' }).click();
      await expect
        .poll(async () =>
          (await page.context().cookies()).some((cookie) =>
            /^sb-.*-auth-token/.test(cookie.name),
          ),
        )
        .toBe(false);
      await page.goto('/home');
      await page.waitForURL(/\/auth\/sign-in/);
    },
  };
}

export type Auth = ReturnType<typeof createAuth>;
