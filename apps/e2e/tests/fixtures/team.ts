import {
  type APIRequestContext,
  type Page,
  expect,
} from '@playwright/test';

import { newCredentials, type TestUser } from './auth';

// Local Supabase demo service key; identical across every local stack. Used for
// light DB spot-checks the UI cannot surface (invite tokens, membership rows).
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
export const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

export const serviceHeaders = {
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
};

export { newCredentials };
export type { TestUser };

// Mirrors the server slugify in complete-onboarding-action; a team created via
// the onboarding wizard exposes no slug field, so the test derives it the same
// way the server does.
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function signUp(
  page: Page,
  user: TestUser = newCredentials(),
): Promise<TestUser> {
  await page.goto('/auth/sign-up');

  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByLabel('Confirm password').fill(user.password);

  await page.getByRole('button', { name: 'Sign up' }).click();

  // A fresh account is not onboarded, so /home bounces to /onboarding.
  await page.waitForURL(/\/(home|onboarding)(\/|$)/);

  return user;
}

async function acceptTermsAndSkipRest(page: Page) {
  await page.getByLabel('I accept the hosted terms of service').check();
  await page.getByRole('button', { name: 'Continue' }).click();

  // Deal box, then MFA; both skippable. Skipping MFA lands on /home.
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await page.getByRole('button', { name: 'Skip for now' }).click();

  await page.waitForURL(/\/home(\/|$)/);
}

export async function completePersonalOnboarding(page: Page) {
  await page.goto('/onboarding');

  await expect(page.getByLabel('Your name')).toBeVisible();
  await page.getByLabel('Your name').fill('Playwright Owner');
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('button', { name: 'Just me' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await acceptTermsAndSkipRest(page);
}

export async function completeTeamOnboarding(
  page: Page,
  teamName: string,
): Promise<string> {
  await page.goto('/onboarding');

  await expect(page.getByLabel('Your name')).toBeVisible();
  await page.getByLabel('Your name').fill('Playwright Owner');
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('button', { name: 'A team' }).click();
  await page.getByLabel('Team name').fill(teamName);
  await page.getByRole('button', { name: 'Continue' }).click();

  await acceptTermsAndSkipRest(page);

  return slugify(teamName);
}

export interface MembershipRow {
  user_id: string;
  account_role: string;
}

export async function membershipsForAccount(
  request: APIRequestContext,
  accountId: string,
): Promise<MembershipRow[]> {
  const response = await request.get(
    `${SUPABASE_URL}/rest/v1/accounts_memberships?account_id=eq.${accountId}&select=user_id,account_role`,
    { headers: serviceHeaders },
  );
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as MembershipRow[];
}

export async function accountBySlug(
  request: APIRequestContext,
  slug: string,
): Promise<{ id: string; name: string; is_personal_account: boolean }> {
  const response = await request.get(
    `${SUPABASE_URL}/rest/v1/accounts?slug=eq.${slug}&select=id,name,is_personal_account`,
    { headers: serviceHeaders },
  );
  expect(response.ok()).toBeTruthy();
  const rows = (await response.json()) as {
    id: string;
    name: string;
    is_personal_account: boolean;
  }[];
  expect(rows.length).toBe(1);
  return rows[0]!;
}

export interface InvitationRow {
  invite_token: string;
  account_id: string;
  role: string;
}

export async function invitationByEmail(
  request: APIRequestContext,
  email: string,
): Promise<InvitationRow[]> {
  const response = await request.get(
    `${SUPABASE_URL}/rest/v1/invitations?email=eq.${encodeURIComponent(email)}&select=invite_token,account_id,role`,
    { headers: serviceHeaders },
  );
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as InvitationRow[];
}
