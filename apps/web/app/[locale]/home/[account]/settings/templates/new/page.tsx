import { loadTeamWorkspace } from '../../../layout';
import { TemplateAuthoring } from '../_components/template-authoring';

interface NewTemplatePageProps {
  params: Promise<{ locale: string; account: string }>;
}

export default async function NewTemplatePage({
  params,
}: NewTemplatePageProps) {
  const { account } = await params;
  const { team } = await loadTeamWorkspace(account);

  return (
    <main className={'flex flex-col gap-6 p-8'}>
      <h1 className={'text-2xl font-semibold'}>New template</h1>
      <TemplateAuthoring
        accountId={team.id}
        listHref={`/home/${account}/settings/templates`}
      />
    </main>
  );
}
