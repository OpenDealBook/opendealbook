import type { Page } from '@playwright/test';

import type { Cleanup } from './cleanup';
import { firstLink, waitForMessage } from './mail';

export function createLender(cleanup: Cleanup) {
  return {
    async invite(
      roomPage: Page,
      { email, name }: { email: string; name?: string },
    ) {
      await roomPage.getByLabel('Email').fill(email);
      if (name) {
        await roomPage.getByLabel('Name (optional)').fill(name);
      }
      await roomPage
        .getByRole('button', { name: 'Invite', exact: true })
        .click();
      cleanup.track({ kind: 'user', email });
    },

    async signIn(
      page: Page,
      { email, roomId }: { email: string; roomId: string },
    ) {
      const invite = await waitForMessage({
        to: email,
        subject: /invited you to review a loan request/,
      });
      await page.goto(firstLink(invite, /\/auth\/confirm\?/));
      await page
        .getByRole('button', { name: 'Continue to your lender room' })
        .click();
      await page.waitForURL(new RegExp(`/lender/${roomId}$`));
      await page.getByRole('button', { name: 'Skip' }).click();
    },
  };
}

export type Lender = ReturnType<typeof createLender>;
