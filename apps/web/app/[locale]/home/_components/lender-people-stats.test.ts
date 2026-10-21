import { describe, expect, it } from 'vitest';

import { withRoomStats } from './lender-people-stats';

const act = (
  userId: string,
  action: string,
  at: string,
  documentId: string | null = null,
) => ({ kind: 'recorded' as const, userId, action, at, documentId });

describe('what each lender person has done', () => {
  it('adds first room open, last visit, distinct files viewed and downloads to each person', () => {
    const [ana, raj] = withRoomStats(
      [
        { user_id: 'ana', email: 'ana@firstbank.com' },
        { user_id: 'raj', email: 'raj@firstbank.com' },
      ],
      [
        act('ana', 'room_opened', '2026-10-03T10:00:00.000Z'),
        act('ana', 'room_opened', '2026-10-01T10:00:00.000Z'),
        act('ana', 'room_opened', '2026-10-09T10:00:00.000Z'),
        act('ana', 'document_previewed', '2026-10-03T10:01:00.000Z', 'doc-1'),
        act('ana', 'document_previewed', '2026-10-03T10:02:00.000Z', 'doc-1'),
        act('ana', 'document_previewed', '2026-10-03T10:03:00.000Z', 'doc-2'),
        act('ana', 'document_downloaded', '2026-10-03T10:04:00.000Z', 'doc-2'),
        act('ana', 'zip_downloaded', '2026-10-03T10:05:00.000Z'),
        act('ana', 'folder_opened', '2026-10-03T10:06:00.000Z'),
        act('jordan', 'document_previewed', '2026-10-04T10:00:00.000Z', 'doc-9'),
        {
          kind: 'reply' as const,
          userId: 'ana',
          at: '2026-10-10T10:00:00.000Z',
        },
      ],
    );

    expect(ana).toEqual({
      user_id: 'ana',
      email: 'ana@firstbank.com',
      firstOpenedAt: '2026-10-01T10:00:00.000Z',
      lastVisitAt: '2026-10-09T10:00:00.000Z',
      filesViewed: 2,
      downloads: 2,
    });
    expect(raj).toEqual({
      user_id: 'raj',
      email: 'raj@firstbank.com',
      firstOpenedAt: null,
      lastVisitAt: null,
      filesViewed: 0,
      downloads: 0,
    });
  });
});
