import { test as base } from '@playwright/test';

import { createAuth, type Auth } from './auth';
import { settle, type Cleanup, type Created } from './cleanup';
import {
  createContracts,
  createCounsel,
  type Contracts,
  type Counsel,
} from './counsel';
import { createLender, type Lender } from './lender';
import { createSeller, type Seller } from './seller';

export { expect } from '@playwright/test';
export { newCredentials, type TestUser } from './auth';
export { card, REDLINE_DOCX } from './counsel';
export * as db from './db';
export { firstLink, waitForMessage } from './mail';
export {
  completeInviteeOnboarding,
  completeTeamOnboarding,
} from './onboarding';
export * as standIns from './stand-ins';

export const test = base.extend<{
  cleanup: Cleanup;
  auth: Auth;
  lender: Lender;
  seller: Seller;
  counsel: Counsel;
  contracts: Contracts;
}>({
  // eslint-disable-next-line no-empty-pattern -- Playwright fixtures must destructure their first argument.
  cleanup: async ({}, use, testInfo) => {
    const created: Created[] = [];
    await use({ track: (item) => created.push(item) });
    await settle(created, testInfo);
  },
  auth: async ({ cleanup }, use) => use(createAuth(cleanup)),
  lender: async ({ cleanup }, use) => use(createLender(cleanup)),
  seller: async ({ cleanup }, use) => use(createSeller(cleanup)),
  counsel: async ({ cleanup }, use) => use(createCounsel(cleanup)),
  contracts: async ({ cleanup }, use) => use(createContracts(cleanup)),
});
