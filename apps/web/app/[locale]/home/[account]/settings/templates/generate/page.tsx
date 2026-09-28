import { getSupabaseServerClient } from '@tuckin/supabase/server';

import { loadTeamWorkspace } from '../../../layout';
import {
  GenerateForm,
  type DealOption,
  type TemplateOption,
} from '../_components/generate-form';

interface GeneratePageProps {
  params: Promise<{ locale: string; account: string }>;
}

export default async function GeneratePage({ params }: GeneratePageProps) {
  const { account } = await params;
  const { team } = await loadTeamWorkspace(account);

  const client = getSupabaseServerClient();

  const { data: templateRows } = await client
    .from('document_template')
    .select('id, name, type')
    .eq('account_id', team.id)
    .order('name', { ascending: true });

  const ids = (templateRows ?? []).map((template) => template.id);

  const { data: fieldRows } = await client
    .from('template_field')
    .select('template_id, key, label, type, source, required')
    .in('template_id', ids.length > 0 ? ids : [''])
    .order('sort_order', { ascending: true });

  const { data: dealRows } = await client
    .from('deal')
    .select('id, stage, description, firm_id')
    .eq('account_id', team.id)
    .order('created_at', { ascending: false });

  const { data: firmRows } = await client
    .from('firm')
    .select('id, name')
    .eq('account_id', team.id);

  const firmName = new Map(
    (firmRows ?? []).map((firm) => [firm.id, firm.name]),
  );

  const templates: TemplateOption[] = (templateRows ?? []).map((template) => ({
    id: template.id,
    name: template.name,
    fields: (fieldRows ?? [])
      .filter((field) => field.template_id === template.id)
      .map((field) => ({
        key: field.key,
        label: field.label ?? field.key,
        type: field.type ?? 'text',
        source: field.source ?? 'manual',
        required: field.required,
      })),
  }));

  const deals: DealOption[] = (dealRows ?? []).map((deal) => ({
    id: deal.id,
    label:
      (deal.firm_id ? firmName.get(deal.firm_id) : null) ??
      deal.description ??
      `${deal.stage} deal`,
  }));

  return (
    <main className={'flex flex-col gap-6 p-8'}>
      <h1 className={'text-2xl font-semibold'}>Generate document</h1>
      <GenerateForm accountId={team.id} templates={templates} deals={deals} />
    </main>
  );
}
