import { CreateTeamForm } from '@odb/team-accounts';
import { PageHeader } from '@odb/ui/page-header';

export default function CreateTeamPage() {
  return (
    <main className={'flex flex-col gap-6 p-8'}>
      <PageHeader title={'Create team'} />
      <CreateTeamForm />
    </main>
  );
}
