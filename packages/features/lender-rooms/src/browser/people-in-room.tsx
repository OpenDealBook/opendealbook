interface Person {
  user_id: string;
  email: string;
  name: string | null;
  has_signed_in: boolean;
}

function byNameThenEmail(a: Person, b: Person): number {
  return (a.name ?? a.email).localeCompare(b.name ?? b.email, 'en');
}

export function PeopleInRoom({
  people,
  viewerId,
}: {
  people: Person[];
  viewerId: string;
}) {
  const ordered = [
    ...people.filter((person) => person.user_id === viewerId),
    ...people
      .filter((person) => person.user_id !== viewerId)
      .toSorted(byNameThenEmail),
  ];

  return (
    <section
      aria-labelledby={'people-in-room'}
      className={'flex flex-col gap-1 text-sm'}
    >
      <h2
        id={'people-in-room'}
        className={'text-muted-foreground text-xs font-normal'}
      >
        People in this room
      </h2>
      <ul className={'flex flex-col gap-1.5'}>
        {ordered.map((person) => {
          const you = person.user_id === viewerId ? ' (you)' : '';

          return (
            <li key={person.user_id} className={'flex min-w-0 flex-col'}>
              {person.name ? (
                <>
                  <span className={'truncate font-medium'}>
                    {person.name}
                    {you}
                  </span>
                  <span className={'text-muted-foreground truncate text-xs'}>
                    {person.email}
                  </span>
                </>
              ) : (
                <span className={'truncate'}>
                  {person.email}
                  {you}
                </span>
              )}
              {person.has_signed_in || person.user_id === viewerId ? null : (
                <span className={'text-muted-foreground text-xs'}>
                  Invited, not signed in yet
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
