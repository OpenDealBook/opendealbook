// @vitest-environment jsdom
import { act } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeRoom } from '@odb/lender-rooms/requests-ui/test-support/fake-room.ts';
import {
  attach,
  buttonNames,
  clearScreen,
  settle,
  show,
} from '@odb/lender-rooms/requests-ui/test-support/screen.ts';

import { SellerCounselFolder } from './seller-counsel-folder';

const DEAL = '11111111-1111-4111-8111-111111111111';
const FOLDER = '0a2c7b8e-41d7-4b4e-8f39-6b2f7a0a2b22';
const DOCUMENT = '0a2c7b8e-41d7-4b4e-8f39-6b2f7a0a2b44';
const DRAFTS = '0a2c7b8e-41d7-4b4e-8f39-6b2f7a0a2b33';
const FOLDERS = [
  { id: FOLDER, path: "Seller's counsel" },
  { id: DRAFTS, path: "Seller's counsel / Drafts" },
];

vi.mock(
  '@odb/lender-rooms/uploads/actions.ts',
  async () =>
    (await import('@odb/lender-rooms/requests-ui/test-support/fake-room.ts'))
      .uploadActions,
);
vi.mock('@odb/lender-rooms/uploads/folder-actions.ts', () => ({
  createFolder: async () => ({ ok: true, value: 'new' }),
}));
vi.mock(
  '@odb/supabase/client',
  async () =>
    (await import('@odb/lender-rooms/requests-ui/test-support/fake-room.ts'))
      .browserClient,
);
vi.mock(
  'next/navigation',
  async () =>
    (await import('@odb/lender-rooms/requests-ui/test-support/fake-room.ts'))
      .navigation,
);

beforeEach(() => {
  fakeRoom.reset();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(clearScreen);

describe('SellerCounselFolder', () => {
  it("links each file in the Seller's counsel folder", () => {
    show(
      <SellerCounselFolder
        dealId={DEAL}
        folders={FOLDERS}
        files={[{ documentId: DOCUMENT, name: 'side-letter.pdf' }]}
      />,
    );

    const links = [...document.querySelectorAll('a')].map((link) => [
      link.textContent,
      link.getAttribute('href'),
    ]);

    expect(links).toEqual([
      [
        'side-letter.pdf',
        `/counsel/${DEAL}/seller-room/files/${DOCUMENT}?disposition=download`,
      ],
    ]);
  });

  it('keeps the files readable but offers no upload or new folder once read-only', () => {
    show(
      <SellerCounselFolder
        dealId={DEAL}
        folders={FOLDERS}
        files={[{ documentId: DOCUMENT, name: 'side-letter.pdf' }]}
        readOnly
      />,
    );

    expect(document.querySelector('a')?.textContent).toBe('side-letter.pdf');
    expect(document.querySelector('button')).toBeNull();
    expect(document.body.textContent).not.toContain('read-only');
  });

  it("sends an upload into the Seller's counsel folder", async () => {
    show(<SellerCounselFolder dealId={DEAL} folders={FOLDERS} files={[]} />);

    await attach('Upload files', 'draft-reps.pdf');
    await settle();

    expect(fakeRoom.begun).toEqual([
      {
        sellerCounselDealId: DEAL,
        folderId: FOLDER,
        name: 'draft-reps.pdf',
        size: 1,
      },
    ]);
  });

  it('sends an upload into the subfolder picked, and offers a new folder', async () => {
    show(<SellerCounselFolder dealId={DEAL} folders={FOLDERS} files={[]} />);

    const select = document.querySelector<HTMLSelectElement>(
      'select[aria-label="Upload into"]',
    )!;

    await act(async () => {
      select.value = DRAFTS;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await attach('Upload files', 'schedule.pdf');
    await settle();

    expect(fakeRoom.begun).toEqual([
      {
        sellerCounselDealId: DEAL,
        folderId: DRAFTS,
        name: 'schedule.pdf',
        size: 1,
      },
    ]);
    expect(buttonNames()).toContain('New folder');
  });
});
