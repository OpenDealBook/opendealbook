import { expect, type Page } from '@playwright/test';

import type { Cleanup } from './cleanup';
import { firstLink, waitForMessage } from './mail';

const ROOM_PATH = /\/seller\/rooms\/([0-9a-f-]{36})$/;

export function createSeller(cleanup: Cleanup) {
  return {
    async invite(
      dealPage: Page,
      { email, name }: { email: string; name: string },
    ) {
      await dealPage.getByLabel('Seller name').fill(name);
      await dealPage.getByLabel('Seller email').fill(email);
      await dealPage.getByRole('button', { name: 'Invite seller' }).click();
      cleanup.track({ kind: 'user', email });
    },

    async signIn(page: Page, { email }: { email: string }): Promise<string> {
      const invite = await waitForMessage({
        to: email,
        subject: /invited you to the room for/,
      });
      await page.goto(firstLink(invite, /\/seller\/confirm\?/));
      await page
        .getByRole('button', { name: 'Continue to your room' })
        .click();
      await page.waitForURL(ROOM_PATH);
      await page.getByRole('button', { name: 'Skip' }).click();
      await expect(page.getByRole('button', { name: 'Skip' })).toHaveCount(0);
      await expect(
        page.getByLabel('Add a phone number (optional)'),
      ).toHaveCount(0);
      return ROOM_PATH.exec(new URL(page.url()).pathname)![1]!;
    },
  };
}

export type Seller = ReturnType<typeof createSeller>;
