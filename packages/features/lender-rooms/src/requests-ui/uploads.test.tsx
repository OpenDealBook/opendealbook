// @vitest-environment jsdom
import './test-support/mocks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeRoom } from './test-support/fake-room';
import { attach, clearScreen, settle, show } from './test-support/screen';
import { AttachButton, useUploads } from './uploads';

const ROOM = '7d0f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11';
const DEAL = '11111111-1111-4111-8111-111111111111';
const FOLDER = '0a2c7b8e-41d7-4b4e-8f39-6b2f7a0a2b22';

function Uploader({
  space,
}: {
  space: { roomId: string } | { dealId: string };
}) {
  const uploads = useUploads({ space, folderId: FOLDER });

  return (
    <AttachButton onPick={uploads.pick} multiple>
      Add files
    </AttachButton>
  );
}

beforeEach(() => {
  fakeRoom.reset();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(clearScreen);

describe('where an upload goes', () => {
  it('starts a room upload in that room', async () => {
    show(<Uploader space={{ roomId: ROOM }} />);

    await attach('Add files', 'rent-roll.csv');
    await settle();

    expect(fakeRoom.begun).toEqual([
      { roomId: ROOM, folderId: FOLDER, name: 'rent-roll.csv', size: 1 },
    ]);
  });

  it('starts a lender package upload in the deal, with no room', async () => {
    show(<Uploader space={{ dealId: DEAL }} />);

    await attach('Add files', 'teaser.pdf');
    await settle();

    expect(fakeRoom.begun).toEqual([
      { dealId: DEAL, folderId: FOLDER, name: 'teaser.pdf', size: 1 },
    ]);
  });
});
