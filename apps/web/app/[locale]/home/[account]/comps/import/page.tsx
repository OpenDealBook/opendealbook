import { PageHeader } from '@odb/ui/page-header';

import { loadTeamWorkspace } from '../../layout';
import { CompsImportForm } from './_components/comps-import-form';

interface CompsImportPageProps {
  params: Promise<{ locale: string; account: string }>;
}

export default async function CompsImportPage({
  params,
}: CompsImportPageProps) {
  const { account } = await params;
  const { team } = await loadTeamWorkspace(account);

  return (
    <main className={'flex flex-col gap-6 p-8'}>
      <PageHeader
        title={'Import comps'}
        description={
          'Upload a DealStats, BIZCOMPS, or PeerComps export. Rows land as proprietary comps visible only to this account while its vendor license is active.'
        }
      />

      <CompsImportForm accountId={team.id} />
    </main>
  );
}
