import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { RoomDocuments } from './room-documents';

const room = 'a0000000-0000-4000-8000-000000000001';

describe('RoomDocuments', () => {
  it('lists each document the team sent, named like the email attachment, opening through the room', () => {
    const html = renderToStaticMarkup(
      <RoomDocuments
        roomId={room}
        teamName={'Acme Partners'}
        documents={[
          {
            share_id: 's-1',
            template_name: 'LOI',
            firm_name: 'Acme',
            sent_at: '2026-10-15T10:00:00Z',
          },
          {
            share_id: 's-2',
            template_name: null,
            firm_name: null,
            sent_at: null,
          },
        ]}
      />,
    );

    expect(html).toContain('Documents from Acme Partners');
    expect(html).toContain('LOI - Acme.pdf');
    expect(html).toContain('Document.pdf');
    expect(html).toContain(`href="/seller/rooms/${room}/documents/s-1"`);
  });

  it('shows nothing when the team has sent no documents', () => {
    expect(
      renderToStaticMarkup(
        <RoomDocuments
          roomId={room}
          teamName={'Acme Partners'}
          documents={[]}
        />,
      ),
    ).toBe('');
  });
});
