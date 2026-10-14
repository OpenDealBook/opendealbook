import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./actions', () => ({
  requestLenderRoomAccess: async () => ({ ok: true, value: undefined }),
}));

import { ClosedRoomNotice } from './closed-room-notice';

function noticeText(dealName: string | null) {
  const html = renderToStaticMarkup(
    <ClosedRoomNotice
      roomId={'7d0f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11'}
      roomName={'First Bank'}
      dealName={dealName}
      contactEmail={'deals@buyer.test'}
    />,
  );

  return html.replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'");
}

describe('ClosedRoomNotice', () => {
  it("asks the named deal's team to reopen the room", () => {
    expect(noticeText('Target Co')).toContain(
      "This room is closed. To ask Target Co's team to reopen it, use the button below or write to deals@buyer.test.",
    );
  });

  it('asks the deal team when the deal has no name', () => {
    expect(noticeText(null)).toContain(
      'This room is closed. To ask the deal team to reopen it, use the button below or write to deals@buyer.test.',
    );
  });
});
