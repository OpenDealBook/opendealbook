import { LenderCreateRoom } from './lender-create-room';
import { LenderRoomList, type LenderRoomRow } from './lender-room-list';

export function LenderRoomsOverview({
  dealId,
  basePath,
  rows,
}: {
  dealId: string;
  basePath: string;
  rows: LenderRoomRow[];
}) {
  if (rows.length === 0) {
    return (
      <section
        className={
          'flex flex-col items-start gap-4 rounded-xl border border-dashed p-10'
        }
      >
        <div className={'flex max-w-xl flex-col gap-1'}>
          <h1 className={'font-serif text-2xl font-medium'}>
            No lender rooms yet
          </h1>
          <p className={'text-muted-foreground'}>
            Each lender gets a private room with your lender package, their own
            folder, and a place to send requests. Lenders never see each other.
          </p>
        </div>
        <LenderCreateRoom
          dealId={dealId}
          basePath={basePath}
          openLabel={'Create the first lender room'}
        />
      </section>
    );
  }

  return (
    <section className={'flex flex-col gap-4'}>
      <div className={'flex items-center justify-between gap-4'}>
        <h1 className={'font-serif text-2xl font-medium'}>Lenders</h1>
        <LenderCreateRoom
          dealId={dealId}
          basePath={basePath}
          openLabel={'Create lender room'}
        />
      </div>
      <LenderRoomList rows={rows} hrefFor={(row) => `${basePath}/${row.id}`} />
    </section>
  );
}
