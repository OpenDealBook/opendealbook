import { Landmark } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { EmptyState } from '@odb/ui/empty-state';
import { PageHeader } from '@odb/ui/page-header';

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
  const t = useTranslations('empty.lenderRooms');

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Landmark}
        title={t('title')}
        description={t('description')}
        action={
          <LenderCreateRoom
            dealId={dealId}
            basePath={basePath}
            openLabel={t('action')}
          />
        }
      />
    );
  }

  return (
    <section className={'flex flex-col gap-4'}>
      <PageHeader
        level={2}
        title={'Lenders'}
        actions={
          <LenderCreateRoom
            dealId={dealId}
            basePath={basePath}
            openLabel={'Create lender room'}
          />
        }
      />
      <LenderRoomList rows={rows} hrefFor={(row) => `${basePath}/${row.id}`} />
    </section>
  );
}
