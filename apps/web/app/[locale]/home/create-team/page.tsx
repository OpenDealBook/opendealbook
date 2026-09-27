import { CreateTeamForm } from '@tuckin/team-accounts';

export default function CreateTeamPage() {
  return (
    <main className={'flex flex-col gap-6 p-8'}>
      <h1 className={'text-2xl font-semibold'}>Create team</h1>
      <CreateTeamForm />
    </main>
  );
}
