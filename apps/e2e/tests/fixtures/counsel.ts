import { expect, type Locator, type Page } from '@playwright/test';

import type { Cleanup } from './cleanup';
import { insert, rows, rpc } from './db';
import { firstLink, waitForMessage } from './mail';
import { SUPABASE_URL, serviceHeaders } from './stack';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CONTRACTS_BUCKET = 'contracts';
const DOCX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function templateFixture(name: string): string {
  return fileURLToPath(
    new URL(`../../../../packages/templates/fixtures/${name}`, import.meta.url),
  );
}

export const DRAFT_DOCX = templateFixture('loi-standard.docx');
export const REDLINE_DOCX = templateFixture('loi-smb.docx');

export function card(page: Page, title: string): Locator {
  return page
    .getByRole('heading', { name: title, exact: true })
    .locator('xpath=ancestor::*[@data-slot="card"][1]');
}

export function createCounsel(cleanup: Cleanup) {
  async function invite(
    form: Locator,
    button: string,
    { email, name }: { email: string; name?: string },
  ) {
    if (name) {
      await form.getByLabel('Name (optional)').fill(name);
    }
    await form.getByLabel('Email', { exact: true }).fill(email);
    await form.getByRole('button', { name: button }).click();
    cleanup.track({ kind: 'user', email });
  }

  return {
    inviteBuyerCounsel(
      dealPage: Page,
      person: { email: string; name?: string },
    ) {
      return invite(card(dealPage, 'Counsel'), "Invite buyer's counsel", person);
    },

    inviteSellerCounsel(
      roomPage: Page,
      person: { email: string; name?: string },
    ) {
      return invite(
        card(roomPage, 'Your counsel'),
        'Invite your counsel',
        person,
      );
    },

    async signIn(page: Page, { email, dealId }: { email: string; dealId: string }) {
      const invite = await waitForMessage({ to: email, subject: /counsel/ });
      await page.goto(firstLink(invite, /\/counsel\/confirm\?/));
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await page.waitForURL(new RegExp(`/counsel/${dealId}$`));
      await page.getByRole('button', { name: 'Skip' }).click();
      await expect(page.getByRole('button', { name: 'Skip' })).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Contracts' })).toBeVisible();
    },
  };
}

export type Counsel = ReturnType<typeof createCounsel>;

export interface SeededVersion {
  party: 'buyer' | 'seller';
  summary: string;
  shared?: boolean;
}

export function createContracts(cleanup: Cleanup) {
  async function uploadDocx(path: string) {
    const response = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${CONTRACTS_BUCKET}/${path}`,
      {
        method: 'POST',
        headers: { ...serviceHeaders, 'Content-Type': DOCX_CONTENT_TYPE },
        body: readFileSync(DRAFT_DOCX),
      },
    );
    expect(response.ok, `upload ${path}: ${await response.text()}`).toBe(
      true,
    );
  }

  return {
    async seed({
      dealId,
      versions,
      type = 'loi',
    }: {
      dealId: string;
      versions: SeededVersion[];
      type?: 'loi' | 'apa';
    }): Promise<string[]> {
      const [deal] = await rows<{ account_id: string }>(
        'deal',
        `id=eq.${dealId}&select=account_id`,
      );
      const accountId = deal!.account_id;
      const contractId = crypto.randomUUID();
      cleanup.track({
        kind: 'storage',
        bucket: CONTRACTS_BUCKET,
        prefix: `${accountId}/${contractId}`,
      });

      await rpc('append_deal_event', {
        p_deal_id: dealId,
        p_aggregate_type: 'contract',
        p_aggregate_id: contractId,
        p_event_type: 'contract.created',
        p_payload: {
          type,
          status: 'draft',
          current_version: versions.length,
        },
        p_actor_kind: 'service',
      });

      const ids: string[] = [];
      for (const [index, version] of versions.entries()) {
        const docxPath = `${accountId}/${contractId}/v${index + 1}.docx`;
        await uploadDocx(docxPath);
        const [row] = await insert<{ id: string }>('contract_version', {
          contract_id: contractId,
          account_id: accountId,
          version: index + 1,
          source: 'upload',
          party: version.party,
          change_summary: version.summary,
          docx_path: docxPath,
          docx_bucket: CONTRACTS_BUCKET,
          shared_at: version.shared ? new Date().toISOString() : null,
        });
        ids.push(row!.id);
      }

      return ids;
    },
  };
}

export type Contracts = ReturnType<typeof createContracts>;
