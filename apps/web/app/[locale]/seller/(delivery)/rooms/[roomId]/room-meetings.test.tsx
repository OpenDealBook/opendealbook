import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { RoomMeetings } from './room-meetings';

const room = 'a0000000-0000-4000-8000-000000000001';

describe('RoomMeetings', () => {
  it('lists each shared meeting, opening it in the room', () => {
    const html = renderToStaticMarkup(
      <RoomMeetings
        roomId={room}
        meetings={[
          {
            id: 'm-1',
            type: 'weekly',
            scheduled_at: '2026-10-01T10:00:00Z',
            transcript_text: 'Long transcript',
            summary: 'Short summary',
          },
        ]}
      />,
    );

    expect(html).toContain('Meetings');
    expect(html).toContain('Weekly meeting, Oct 1, 2026');
    expect(html).toContain(`href="/seller/rooms/${room}/meetings/m-1"`);
    expect(html).not.toContain('Long transcript');
  });

  it('shows nothing when no meeting is shared', () => {
    expect(
      renderToStaticMarkup(<RoomMeetings roomId={room} meetings={[]} />),
    ).toBe('');
  });
});
