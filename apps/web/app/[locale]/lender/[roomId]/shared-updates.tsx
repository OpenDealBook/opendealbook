import { LocalTime } from '@odb/lender-rooms/requests-ui/local-time.tsx';

type SharedUpdate = {
  subject: string;
  body: string;
  sent_at: string;
};

export function SharedUpdates({ updates }: { updates: SharedUpdate[] }) {
  if (updates.length === 0) {
    return null;
  }

  return (
    <section className={'flex flex-col gap-2'}>
      <h2 className={'text-lg font-semibold'}>Updates</h2>
      <ul className={'flex flex-col divide-y'}>
        {updates.map((update, index) => (
          <li key={index} className={'flex flex-col gap-1 py-3'}>
            <div className={'flex items-baseline justify-between gap-4'}>
              <h3 className={'font-medium'}>{update.subject}</h3>
              <span className={'text-muted-foreground shrink-0 text-sm'}>
                <LocalTime at={update.sent_at} />
              </span>
            </div>
            <p className={'text-sm whitespace-pre-wrap'}>{update.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
