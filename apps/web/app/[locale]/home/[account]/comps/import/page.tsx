import { loadTeamWorkspace } from '../../layout';
import { CompsImportForm } from './_components/comps-import-form';

interface CompsImportPageProps {
  params: Promise<{ locale: string; account: string }>;
}

export default async function CompsImportPage({ params }: CompsImportPageProps) {
  const { account } = await params;
  const { team } = await loadTeamWorkspace(account);

  return (
    <main className={'flex flex-col gap-6 p-8'}>
      <div className={'flex flex-col gap-1'}>
        <h1 className={'text-2xl font-semibold'}>Import comps</h1>
        <p className={'text-muted-foreground text-sm'}>
          Upload a DealStats, BIZCOMPS, or PeerComps export. Rows land as
          proprietary comps visible only to this account while its vendor license
          is active.
        </p>
      </div>

      <CompsImportForm accountId={team.id} />
    </main>
  );
}
