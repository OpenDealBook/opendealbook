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

import { CounselUploads } from './counsel-uploads';

const DEAL = '11111111-1111-4111-8111-111111111111';
const COUNSEL_FOLDER = '0a2c7b8e-41d7-4b4e-8f39-6b2f7a0a2b22';
const REDLINES = '0a2c7b8e-41d7-4b4e-8f39-6b2f7a0a2b33';

const opened = vi.hoisted(() => ({ count: 0 }));

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
vi.mock('@odb/deal-counsel/uploads.ts', () => ({
  openBuyerCounselUploads: async () => {
    opened.count += 1;

    return { ok: true, value: COUNSEL_FOLDER };
  },
}));

beforeEach(() => {
  fakeRoom.reset();
  opened.count = 0;
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(clearScreen);

describe('CounselUploads', () => {
  it("opens the Buyer's counsel folder on the first upload and sends the file there", async () => {
    show(<CounselUploads dealId={DEAL} folders={[]} />);

    await attach('Upload files', 'redline.pdf');
    await settle();

    expect(opened.count).toBe(1);
    expect(fakeRoom.begun).toEqual([
      {
        counselDealId: DEAL,
        folderId: COUNSEL_FOLDER,
        name: 'redline.pdf',
        size: 1,
      },
    ]);
    expect(buttonNames()).not.toContain('New folder');
  });

  it('sends a file into the subfolder counsel pick', async () => {
    show(
      <CounselUploads
        dealId={DEAL}
        folders={[
          { id: COUNSEL_FOLDER, path: "Buyer's counsel" },
          { id: REDLINES, path: "Buyer's counsel / Redlines" },
        ]}
      />,
    );

    const select = document.querySelector<HTMLSelectElement>(
      'select[aria-label="Upload into"]',
    )!;

    await act(async () => {
      select.value = REDLINES;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await attach('Upload files', 'markup.docx');
    await settle();

    expect(fakeRoom.begun).toEqual([
      {
        counselDealId: DEAL,
        folderId: REDLINES,
        name: 'markup.docx',
        size: 1,
      },
    ]);
    expect(buttonNames()).toContain('New folder');
  });
});
