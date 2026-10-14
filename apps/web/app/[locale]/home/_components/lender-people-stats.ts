export interface RoomStats {
  firstOpenedAt: string | null;
  lastVisitAt: string | null;
  filesViewed: number;
  downloads: number;
}

type FeedEntry =
  | {
      kind: 'recorded';
      userId: string | null;
      action: string;
      at: string;
      documentId: string | null;
    }
  | { kind: string; userId: string | null; at: string };

export function withRoomStats<Person extends { user_id: string }>(
  people: Person[],
  feed: FeedEntry[],
): (Person & RoomStats)[] {
  const recorded = feed.filter(
    (entry): entry is Extract<FeedEntry, { kind: 'recorded' }> =>
      entry.kind === 'recorded',
  );

  return people.map((person) => {
    const own = recorded.filter((entry) => entry.userId === person.user_id);
    const visits = own
      .filter((entry) => entry.action === 'room_opened')
      .map((entry) => entry.at)
      .toSorted((a, b) => Date.parse(a) - Date.parse(b));
    const distinctFiles = (action: string) =>
      new Set(
        own
          .filter((entry) => entry.action === action)
          .map((entry) => entry.documentId),
      ).size;

    return {
      ...person,
      firstOpenedAt: visits[0] ?? null,
      lastVisitAt: visits.at(-1) ?? null,
      filesViewed: distinctFiles('document_previewed'),
      downloads:
        distinctFiles('document_downloaded') +
        own.filter((entry) => entry.action === 'zip_downloaded').length,
    };
  });
}
