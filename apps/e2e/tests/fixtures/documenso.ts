import { expect, type Browser, type Page } from '@playwright/test';

import { firstLink, waitForMessage } from './mail';
import { DOCUMENSO_URL } from './stack';

const HARNESS_ACCOUNT = {
  email: 'e2e-documenso@opendealbook.test',
  password: 'E2e-Documenso-Pass-1!',
};

const SIGNATURE_SPOTS = [
  { x: 600, y: 300 },
  { x: 600, y: 450 },
  { x: 600, y: 600 },
];

export const DOCUMENSO_VIEWPORT = { width: 1500, height: 1100 };

export async function openDocumensoSender(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ viewport: DOCUMENSO_VIEWPORT });
  const page = await context.newPage();
  await expect(async () => {
    await page.goto(`${DOCUMENSO_URL}/signin`);
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Email').fill(HARNESS_ACCOUNT.email);
    await page.getByLabel('Password', { exact: true }).fill(HARNESS_ACCOUNT.password);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForURL(/\/t\/[^/]+\//, { timeout: 30_000 });
  }).toPass({ timeout: 150_000 });
  return page;
}

export async function placeSignaturesAndSend(
  sender: Page,
  editorUrl: string,
  signerNames: string[],
) {
  await sender.goto(editorUrl);
  await sender.getByRole('button', { name: 'Add Fields', exact: true }).click();
  await expect(sender.getByText('Selected Recipient')).toBeVisible();

  for (const [index, name] of signerNames.entries()) {
    await sender.getByRole('combobox').first().click();
    await sender.getByRole('option', { name: new RegExp(name) }).click();
    await expect(sender.getByRole('listbox')).toHaveCount(0);
    const spot = SIGNATURE_SPOTS[index]!;
    await expect(async () => {
      await sender
        .getByRole('button', { name: 'Signature', exact: true })
        .click();
      await sender.mouse.move(spot.x - 40, spot.y - 20);
      await sender.mouse.move(spot.x, spot.y);
      await sender.mouse.click(spot.x, spot.y);
      await expect(
        sender.getByText(`${index + 1} Field`).first(),
      ).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 30_000 });
  }

  await sender.getByRole('button', { name: 'Send Document' }).first().click();
  await sender
    .getByRole('dialog')
    .getByRole('button', { name: 'Send', exact: true })
    .click();
  await expect(sender.getByRole('dialog')).toBeHidden();
}

const openedInvitations = new Set<string>();

async function newInvitation(email: string) {
  let invitation: Awaited<ReturnType<typeof waitForMessage>> | undefined;

  await expect
    .poll(
      async () => {
        invitation = await waitForMessage({
          to: email,
          subject: /Please sign this document/,
          timeout: 5_000,
        }).catch(() => undefined);
        return invitation !== undefined && !openedInvitations.has(invitation.id);
      },
      { message: `a new signing invitation for ${email}`, timeout: 120_000 },
    )
    .toBe(true);

  openedInvitations.add(invitation!.id);
  return invitation!;
}

export async function signDocumentFromEmail(
  signer: Page,
  { email, name }: { email: string; name: string },
) {
  const invitation = await newInvitation(email);
  await signer.goto(firstLink(invitation, /\/sign\//));

  await signer.waitForLoadState('networkidle');
  const pad = signer.getByRole('dialog');
  await expect(async () => {
    await signer
      .getByText('Signature', { exact: true })
      .first()
      .locator('xpath=following-sibling::*[1]')
      .click();
    await expect(pad.getByRole('tab', { name: 'Type' })).toBeVisible({
      timeout: 3_000,
    });
  }).toPass({ timeout: 45_000 });
  await pad.getByRole('tab', { name: 'Type' }).click();
  await pad.getByPlaceholder('Type your signature').fill(name);
  await pad.getByRole('button', { name: 'Next' }).click();

  const complete = signer.getByRole('button', { name: 'Complete', exact: true });
  for (let attempt = 0; attempt < 8 && !(await complete.isVisible()); attempt++) {
    await signer.getByRole('button', { name: 'Next Field' }).click();
    const hint = signer.getByText('Click to insert field');
    await expect(async () => {
      const box = await hint.boundingBox();
      expect(box).not.toBeNull();
      await signer.mouse.click(box!.x + box!.width / 2, box!.y + box!.height + 25);
    }).toPass({ timeout: 30_000 });
    await signer.waitForTimeout(500);
  }
  await expect(complete).toBeVisible();
  await complete.click();
  await signer.getByRole('dialog').getByRole('button', { name: 'Sign', exact: true }).click();
  await expect(signer.getByText('Document Signed')).toBeVisible({ timeout: 60_000 });
}
