import { completeTeamOnboarding, expect, test } from './fixtures';

test('team billing renders the plan and checkout entry point', async ({
  page,
  auth,
}) => {
  test.setTimeout(120 * 1000);

  await auth.signUp(page);
  const slug = await completeTeamOnboarding(
    page,
    `Vantage Group ${Date.now()}`,
  );

  await page.goto(`/home/${slug}/billing`);

  await expect(page.getByRole('heading', { name: 'Billing' })).toBeVisible();
  await expect(page.getByText(/Trial: \d+ days left/)).toBeVisible();

  // The product/plan from billing.config renders a Checkout entry point.
  const checkout = page.getByRole('button', { name: 'Checkout' }).first();
  await expect(checkout).toBeVisible();
  await expect(checkout).toBeEnabled();
});

// Clicking Checkout calls createTeamCheckoutAction -> Stripe and then redirects
// to Stripe Checkout. The local stack ships only a placeholder STRIPE_SECRET_KEY
// (sk_test_dumm...) and has no `stripe listen` webhook forwarder, so the real
// charge cannot be exercised here without fabricating a pass. Completing this
// step needs real Stripe TEST keys (STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET)
// plus a running `stripe listen --forward-to localhost:3000/api/billing/webhook`.
test.skip('completes Stripe checkout for the team (requires Stripe test config)', async ({
  page,
}) => {
  const slug = 'team-slug';
  await page.goto(`/home/${slug}/billing`);

  await page.getByRole('button', { name: 'Checkout' }).click();
  await page.waitForURL(/checkout\.stripe\.com/);
});
