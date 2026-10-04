'use client';

import { useEffect, useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import {
  addChecklistItem,
  applyChecklistTemplate,
  updateChecklistItemStatus,
} from '@odb/deals/server';
import {
  type ChecklistOutcome,
  type ChecklistStatus,
  checklistOutcomeSchema,
  checklistStatusSchema,
} from '@odb/deals/schema';
import type { Tables } from '@odb/supabase';
import { useSupabase } from '@odb/supabase/hooks';
import { Button } from '@odb/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';
import { Input } from '@odb/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@odb/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@odb/ui/table';

const CHECKLIST_KIND_LABELS: Record<string, string> = {
  offer: 'Offer',
  diligence: 'Diligence',
  closing: 'Closing',
  post_close: 'Post close',
  other: 'Other',
};

function label(value: string): string {
  return value.replace(/_/g, ' ');
}

function textOrNotSet(value: string | number | null): string {
  return value === null ? 'Not set' : String(value);
}

export function ChecklistSection({
  items,
  dealId,
  accountId,
}: {
  items: Tables<'checklist_item'>[];
  dealId?: string;
  accountId?: string;
}) {
  const groups = groupChecklist(items);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Checklists</CardTitle>
      </CardHeader>
      <CardContent className={'flex flex-col gap-6'}>
        {dealId && accountId ? (
          <ChecklistControls dealId={dealId} accountId={accountId} />
        ) : null}
        {groups.length === 0 ? (
          <p className={'text-muted-foreground text-sm'}>No checklist items</p>
        ) : (
          groups.map((group) => (
            <div key={group.key} className={'flex flex-col gap-2'}>
              <h4 className={'text-sm font-medium'}>
                {CHECKLIST_KIND_LABELS[group.key] ?? group.key}
              </h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Importance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.items.map((item) => (
                    <ChecklistRow key={item.id} item={item} />
                  ))}
                </TableBody>
              </Table>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function ChecklistControls({
  dealId,
  accountId,
}: {
  dealId: string;
  accountId: string;
}) {
  const client = useSupabase();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [templates, setTemplates] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [templateId, setTemplateId] = useState<string | undefined>(undefined);
  const [title, setTitle] = useState('');

  useEffect(() => {
    client
      .from('checklist_template')
      .select('id, name')
      .eq('account_id', accountId)
      .order('name', { ascending: true })
      .then(({ data }) => setTemplates(data ?? []));
  }, [client, accountId]);

  function run(action: () => Promise<unknown>) {
    startTransition(async () => {
      await action();
      router.refresh();
    });
  }

  return (
    <div className={'flex flex-wrap items-end gap-6'}>
      <div className={'flex items-end gap-2'}>
        <Select value={templateId} onValueChange={setTemplateId}>
          <SelectTrigger className={'w-56'} disabled={pending}>
            <SelectValue placeholder={'Select a template'} />
          </SelectTrigger>
          <SelectContent>
            {templates.map((template) => (
              <SelectItem key={template.id} value={template.id}>
                {template.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={'outline'}
          disabled={pending || templateId === undefined}
          onClick={() =>
            run(() =>
              applyChecklistTemplate({
                deal_id: dealId,
                template_id: templateId as string,
              }),
            )
          }
        >
          Apply template
        </Button>
      </div>
      <form
        className={'flex items-end gap-2'}
        onSubmit={(event) => {
          event.preventDefault();
          run(async () => {
            await addChecklistItem({ deal_id: dealId, title: title.trim() });
            setTitle('');
          });
        }}
      >
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={'New item title'}
          className={'w-56'}
        />
        <Button
          type={'submit'}
          variant={'outline'}
          disabled={pending || title.trim() === ''}
        >
          Add item
        </Button>
      </form>
    </div>
  );
}

function ChecklistRow({ item }: { item: Tables<'checklist_item'> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<unknown>) {
    startTransition(async () => {
      await action();
      router.refresh();
    });
  }

  return (
    <TableRow>
      <TableCell>{item.title}</TableCell>
      <TableCell>
        <Select
          value={item.status}
          onValueChange={(status) =>
            run(() =>
              updateChecklistItemStatus({
                id: item.id,
                status: status as ChecklistStatus,
              }),
            )
          }
        >
          <SelectTrigger className={'w-40'} disabled={pending}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {checklistStatusSchema.options.map((status) => (
              <SelectItem key={status} value={status}>
                {label(status)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Select
          value={item.outcome ?? undefined}
          onValueChange={(outcome) =>
            run(() =>
              updateChecklistItemStatus({
                id: item.id,
                status: item.status,
                outcome: outcome as ChecklistOutcome,
              }),
            )
          }
        >
          <SelectTrigger className={'w-40'} disabled={pending}>
            <SelectValue placeholder={'Not set'} />
          </SelectTrigger>
          <SelectContent>
            {checklistOutcomeSchema.options.map((outcome) => (
              <SelectItem key={outcome} value={outcome}>
                {label(outcome)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>{textOrNotSet(item.owner_role)}</TableCell>
      <TableCell>{textOrNotSet(item.importance)}</TableCell>
    </TableRow>
  );
}

interface ChecklistGroup {
  key: string;
  items: Tables<'checklist_item'>[];
}

function groupChecklist(items: Tables<'checklist_item'>[]): ChecklistGroup[] {
  const byKey = new Map<string, Tables<'checklist_item'>[]>();

  for (const item of items) {
    const key = item.kind ?? item.category ?? 'other';
    const bucket = byKey.get(key) ?? [];
    bucket.push(item);
    byKey.set(key, bucket);
  }

  return [...byKey].map(([key, groupItems]) => ({ key, items: groupItems }));
}
