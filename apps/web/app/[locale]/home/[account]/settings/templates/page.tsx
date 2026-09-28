import Link from 'next/link';

import { getSupabaseServerClient } from '@odb/supabase/server';
import { Button } from '@odb/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@odb/ui/table';

import { loadTeamWorkspace } from '../../layout';

interface TemplatesPageProps {
  params: Promise<{ locale: string; account: string }>;
}

export default async function TemplatesPage({ params }: TemplatesPageProps) {
  const { account } = await params;
  const { team } = await loadTeamWorkspace(account);

  const client = getSupabaseServerClient();

  const { data: templates } = await client
    .from('document_template')
    .select('id, name, type, version')
    .eq('account_id', team.id)
    .order('created_at', { ascending: false });

  const ids = (templates ?? []).map((template) => template.id);

  const { data: fields } = await client
    .from('template_field')
    .select('template_id')
    .in('template_id', ids.length > 0 ? ids : ['']);

  const countByTemplate = new Map<string, number>();

  for (const field of fields ?? []) {
    countByTemplate.set(
      field.template_id,
      (countByTemplate.get(field.template_id) ?? 0) + 1,
    );
  }

  const base = `/home/${account}/settings/templates`;

  return (
    <main className={'flex flex-col gap-6 p-8'}>
      <div className={'flex items-center justify-between'}>
        <h1 className={'text-2xl font-semibold'}>Document templates</h1>
        <div className={'flex gap-2'}>
          <Button asChild variant={'outline'}>
            <Link href={`${base}/generate`}>Generate document</Link>
          </Button>
          <Button asChild>
            <Link href={`${base}/new`}>New template</Link>
          </Button>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Fields</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(templates ?? []).map((template) => (
            <TableRow key={template.id}>
              <TableCell className={'font-medium'}>{template.name}</TableCell>
              <TableCell className={'uppercase'}>{template.type}</TableCell>
              <TableCell>{countByTemplate.get(template.id) ?? 0}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {(templates ?? []).length === 0 ? (
        <p className={'text-muted-foreground text-sm'}>
          No templates yet. Upload a .docx to create one.
        </p>
      ) : null}
    </main>
  );
}
