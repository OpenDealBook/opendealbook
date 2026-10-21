import { expect, type Page } from '@playwright/test';

export interface DealBox {
  naics?: string;
  industries?: string;
  states?: string;
  minRevenue?: string;
  maxAskingPrice?: string;
}

export interface OnboardingChoices {
  name?: string;
  dealBox?: DealBox;
  compPoolOptIn?: boolean;
}

const dealBoxLabels: Record<keyof DealBox, string> = {
  naics: 'Target NAICS codes',
  industries: 'Industries',
  states: 'States',
  minRevenue: 'Minimum revenue',
  maxAskingPrice: 'Maximum asking price',
};

const dealBoxFields = [
  'naics',
  'industries',
  'states',
  'minRevenue',
  'maxAskingPrice',
] as const satisfies readonly (keyof DealBox)[];

// Mirrors the server slugify in complete-onboarding-action; the wizard shows
// no slug field, so the test derives it the same way the server does.
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function finishWizard(page: Page, choices: OnboardingChoices) {
  await page.getByLabel('I accept the hosted terms of service').check();
  if (choices.compPoolOptIn) {
    await page
      .getByLabel('Contribute anonymized deal data to the comparables pool')
      .check();
  }
  await page.getByRole('button', { name: 'Continue' }).click();

  if (choices.dealBox) {
    for (const field of dealBoxFields) {
      const value = choices.dealBox[field];
      if (value !== undefined) {
        await page.getByLabel(dealBoxLabels[field]).fill(value);
      }
    }
    await page.getByRole('button', { name: 'Continue' }).click();
  } else {
    await page.getByRole('button', { name: 'Skip for now' }).click();
  }

  // MFA is skippable; skipping it lands in the team.
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await page.waitForURL(/\/home\/[^/]+(\/|$)/);
}

async function startWizard(page: Page, name: string) {
  await page.goto('/onboarding');
  await expect(page.getByLabel('Your name')).toBeVisible();
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Continue' }).click();
}

export async function completeTeamOnboarding(
  page: Page,
  teamName: string,
  choices: OnboardingChoices = {},
): Promise<string> {
  await startWizard(page, choices.name ?? 'Playwright Owner');
  await page.getByLabel('Team name').fill(teamName);
  await page.getByRole('button', { name: 'Continue' }).click();
  await finishWizard(page, choices);
  return slugify(teamName);
}

export async function completeInviteeOnboarding(
  page: Page,
  teamSlug: string,
  name = 'Playwright Member',
) {
  await page.goto(`/onboarding?team=${teamSlug}`);
  await expect(page.getByLabel('Your name')).toBeVisible();
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('I accept the hosted terms of service').check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await page.waitForURL(new RegExp(`/home/${teamSlug}(/|$)`));
}
