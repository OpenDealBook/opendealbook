'use client';

import { useEffect, useState } from 'react';

import { useParams } from 'next/navigation';

import {
  type ChecklistImportance,
  type ChecklistOwnerRole,
  type ChecklistWaitingOn,
  checklistImportanceSchema,
  checklistWaitingOnSchema,
} from '@odb/deals/schema';
import {
  addChecklistItem,
  applyChecklistTemplate,
  linkChecklistDocument,
  postChecklistNote,
  setChecklistItemDetails,
  setChecklistItemWaitingOn,
  updateChecklistItemStatus,
} from '@odb/deals/server';
import { itemAnchor } from '@odb/notifications/relay';
import { requestChecklistItemFromSeller } from '@odb/seller-rooms/questions/actions.ts';
import type { Tables } from '@odb/supabase';
import { useSupabase } from '@odb/supabase/hooks';
import { Button } from '@odb/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';
import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';
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
import { Textarea } from '@odb/ui/textarea';

import { DataRoomDocumentLink } from './data-room-document-link';
import { DueDate, isOverdue, useToday } from './due-date';
import { useRefusableAction } from './use-refusable-action';

const CHECKLIST_KIND_LABELS: Record<string, string> = {
  offer: 'Offer',
  diligence: 'Diligence',
  closing: 'Closing',
  post_close: 'Post close',
  other: 'Other',
};

const STATUS_CHOICES = {
  not_started: { label: 'Not started', change: { status: 'not_started' } },
  requested: { label: 'Requested', change: { status: 'requested' } },
  received: { label: 'Received', change: { status: 'received' } },
  clean: {
    label: 'Reviewed: clean',
    change: { status: 'reviewed', outcome: 'accepted' },
  },
  issue: {
    label: 'Reviewed: issue',
    change: { status: 'reviewed', outcome: 'follow_up' },
  },
} as const;

type StatusChoice = keyof typeof STATUS_CHOICES;

function statusChoice(item: Item): StatusChoice {
  if (item.status !== 'reviewed') {
    return item.status;
  }

  return item.outcome === 'accepted' ? 'clean' : 'issue';
}

const IMPORTANCE_LABELS: Record<ChecklistImportance, string> = {
  required: 'Required',
  nice_to_have: 'Nice to have',
  na: 'Not applicable',
};

const OWNER_ROLE_LABELS: Record<ChecklistOwnerRole, string> = {
  buyer: 'Buyer',
  attorney: 'Attorney',
  cpa: 'CPA',
  broker: 'Broker',
  seller: 'Seller',
  sales_team: 'Sales team',
};

const ANCHOR_LABELS: Record<string, string> = {
  diligence: 'LOI signed date',
  closing: 'target closing date',
  post_close: 'closing date',
};

const WAITING_ON_LABELS: Record<ChecklistWaitingOn, string> = {
  us: 'Us',
  seller: 'Seller',
  counsel: 'Counsel',
  lender: 'Lender',
};

const FILTERS = ['All', 'Mine', 'Overdue', 'Waiting on seller'] as const;

type Filter = (typeof FILTERS)[number];

const EMPTY_FILTER: Record<Filter, string> = {
  All: 'No checklist items',
  Mine: 'No checklist items are yours.',
  Overdue: 'Nothing is overdue.',
  'Waiting on seller': 'Nothing is waiting on the seller.',
};

const COLUMNS = 7;

type Item = Tables<'checklist_item'>;

const dueDone = (item: Item) =>
  item.status === 'received' || item.status === 'reviewed';

function overdue(item: Item, today: string) {
  return (
    isOverdue(item.due_at, dueDone(item), today) ||
    isOverdue(item.review_due_at, item.status === 'reviewed', today)
  );
}

function unscheduledPrompts(items: Item[]): string[] {
  const counts = new Map<string, number>();

  for (const item of items) {
    const anchor = item.kind === null ? undefined : ANCHOR_LABELS[item.kind];

    if (anchor && item.due_at === null && item.due_offset_days !== null) {
      counts.set(anchor, (counts.get(anchor) ?? 0) + 1);
    }
  }

  return [...counts].map(
    ([anchor, count]) =>
      `Set ${anchor} to schedule ${count} ${count === 1 ? 'item' : 'items'}`,
  );
}

interface Member {
  userId: string;
  name: string;
}

function useDealTeam(dealId: string | undefined) {
  const client = useSupabase();
  const [me, setMe] = useState<string | null>(null);
  const [team, setTeam] = useState<Member[]>([]);

  useEffect(() => {
    if (dealId === undefined) {
      return;
    }

    client.auth.getUser().then(({ data }) => setMe(data.user!.id));
    client
      .rpc('deal_people', { deal_id: dealId })
      .then(({ data }) =>
        setTeam(
          data!
            .filter((person) =>
              person.entries.some((entry) => entry.source === 'team'),
            )
            .map((person) => ({ userId: person.user_id, name: person.name })),
        ),
      );
  }, [client, dealId]);

  return { me, team };
}

interface DataRoomDocument {
  id: string;
  name: string;
}

function useDataRoomDocuments(dealId: string | undefined) {
  const client = useSupabase();
  const [documents, setDocuments] = useState<DataRoomDocument[]>([]);

  useEffect(() => {
    if (dealId === undefined) {
      return;
    }

    client
      .from('dr_document')
      .select('id, name')
      .eq('deal_id', dealId)
      .order('name', { ascending: true })
      .then(({ data }) => setDocuments(data!));
  }, [client, dealId]);

  return documents;
}

export function ChecklistSection({
  items,
  dealId,
  accountId,
}: {
  items: Item[];
  dealId?: string;
  accountId?: string;
}) {
  const today = useToday();
  const { me, team } = useDealTeam(dealId);
  const [filter, setFilter] = useState<Filter>('All');
  const shown = items.filter(
    (item) =>
      filter === 'All' ||
      (filter === 'Mine' && item.owner_user_id === me) ||
      (filter === 'Overdue' && overdue(item, today)) ||
      (filter === 'Waiting on seller' && item.waiting_on === 'seller'),
  );
  const groups = groupChecklist(shown);
  const prompts = unscheduledPrompts(items);
  const params = useParams<{ account: string; id: string }>();
  const documents = useDataRoomDocuments(dealId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Checklists</CardTitle>
      </CardHeader>
      <CardContent className={'flex flex-col gap-6'}>
        {dealId && accountId ? (
          <ChecklistControls dealId={dealId} accountId={accountId} />
        ) : null}
        {prompts.map((prompt) => (
          <a
            key={prompt}
            href={`/home/${params.account}/deals/${params.id}#timeline`}
            className={'text-sm font-medium underline underline-offset-4'}
          >
            {prompt}
          </a>
        ))}
        {items.length === 0 ? (
          <p className={'text-muted-foreground text-sm'}>No checklist items</p>
        ) : (
          <>
            <div
              role={'group'}
              aria-label={'Show checklist items'}
              className={'flex gap-1'}
            >
              {FILTERS.map((each) => (
                <Button
                  key={each}
                  size={'sm'}
                  variant={filter === each ? 'secondary' : 'ghost'}
                  aria-pressed={filter === each}
                  onClick={() => setFilter(each)}
                >
                  {each}
                </Button>
              ))}
            </div>
            {groups.length === 0 ? (
              <p className={'text-muted-foreground text-sm'}>
                {EMPTY_FILTER[filter]}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Waiting on</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Importance</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Review by</TableHead>
                  </TableRow>
                </TableHeader>
                {groups.map((group) => (
                  <TableBody key={group.key}>
                    <TableRow className={'bg-muted/40 hover:bg-muted/40'}>
                      <th
                        scope={'colgroup'}
                        colSpan={COLUMNS}
                        className={'px-2 py-1.5 text-left text-sm font-medium'}
                      >
                        {CHECKLIST_KIND_LABELS[group.key] ?? group.key}
                      </th>
                    </TableRow>
                    {group.items.map((item) => (
                      <ChecklistRow
                        key={item.id}
                        item={item}
                        team={team}
                        documents={documents}
                      />
                    ))}
                  </TableBody>
                ))}
              </Table>
            )}
          </>
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
  const { refusal, pending, run } = useRefusableAction();
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

  return (
    <div className={'flex flex-wrap items-end gap-6'}>
      <div className={'flex flex-wrap items-end gap-2'}>
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
        className={'flex flex-wrap items-end gap-2'}
        onSubmit={(event) => {
          event.preventDefault();
          run(
            () => addChecklistItem({ deal_id: dealId, title: title.trim() }),
            () => setTitle(''),
          );
        }}
      >
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={'New item title'}
          aria-label={'New item title'}
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
      {refusal ? (
        <p role={'alert'} className={'text-destructive text-sm'}>
          {refusal}
        </p>
      ) : null}
    </div>
  );
}

const NOT_SET = '';

const fieldClass = 'bg-background h-8 rounded-md border px-2 text-sm';

const cellFieldClass = `${fieldClass} w-full`;

function ChecklistRow({
  item,
  team,
  documents,
}: {
  item: Item;
  team: Member[];
  documents: DataRoomDocument[];
}) {
  const today = useToday();
  const { refusal, pending, run } = useRefusableAction();
  const [isOpen, setIsOpen] = useState(false);

  function setDetails(details: {
    owner_user_id?: string | null;
    importance?: ChecklistImportance | null;
    due_on?: string | null;
    use_scheduled_date?: true;
  }) {
    run(() =>
      setChecklistItemDetails({
        deal_id: item.deal_id,
        id: item.id,
        ...details,
      }),
    );
  }

  function setStatus(choice: StatusChoice) {
    run(() =>
      updateChecklistItemStatus({
        id: item.id,
        ...STATUS_CHOICES[choice].change,
      }),
    );
  }

  return (
    <>
      <TableRow id={itemAnchor({ kind: 'checklist-item', id: item.id })}>
        <TableCell className={'min-w-32 whitespace-normal'}>
          <button
            type={'button'}
            aria-label={`Details for ${item.title}`}
            aria-expanded={isOpen}
            className={
              'text-left font-medium underline-offset-4 hover:underline focus-visible:underline'
            }
            onClick={() => setIsOpen(!isOpen)}
          >
            {item.title}
          </button>
          {refusal ? (
            <p role={'alert'} className={'text-destructive text-sm'}>
              {refusal}
            </p>
          ) : null}
        </TableCell>
        <TableCell>
          <select
            aria-label={`Status of ${item.title}`}
            className={`${cellFieldClass} min-w-28`}
            value={statusChoice(item)}
            disabled={pending}
            onChange={(event) => setStatus(event.target.value as StatusChoice)}
          >
            {Object.entries(STATUS_CHOICES).map(([choice, { label }]) => (
              <option key={choice} value={choice}>
                {label}
              </option>
            ))}
          </select>
        </TableCell>
        <TableCell>
          <select
            aria-label={`Waiting on for ${item.title}`}
            className={`${cellFieldClass} min-w-20`}
            value={item.waiting_on ?? NOT_SET}
            disabled={pending}
            onChange={(event) =>
              run(() =>
                setChecklistItemWaitingOn({
                  deal_id: item.deal_id,
                  id: item.id,
                  waiting_on: (event.target.value ||
                    null) as ChecklistWaitingOn | null,
                }),
              )
            }
          >
            <option value={NOT_SET}>Not set</option>
            {checklistWaitingOnSchema.options.map((waitingOn) => (
              <option key={waitingOn} value={waitingOn}>
                {WAITING_ON_LABELS[waitingOn]}
              </option>
            ))}
          </select>
        </TableCell>
        <TableCell>
          <div className={'flex flex-col gap-0.5'}>
            <select
              aria-label={`Owner of ${item.title}`}
              className={`${cellFieldClass} min-w-28`}
              value={item.owner_user_id ?? NOT_SET}
              disabled={pending}
              onChange={(event) =>
                setDetails({ owner_user_id: event.target.value || null })
              }
            >
              <option value={NOT_SET}>Not set</option>
              {team.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.name}
                </option>
              ))}
            </select>
            {item.owner_role === null ? null : (
              <span className={'text-muted-foreground text-xs'}>
                {OWNER_ROLE_LABELS[item.owner_role as ChecklistOwnerRole]}
              </span>
            )}
          </div>
        </TableCell>
        <TableCell>
          <select
            aria-label={`Importance of ${item.title}`}
            className={`${cellFieldClass} min-w-24`}
            value={item.importance ?? NOT_SET}
            disabled={pending}
            onChange={(event) =>
              setDetails({
                importance: (event.target.value ||
                  null) as ChecklistImportance | null,
              })
            }
          >
            <option value={NOT_SET}>Not set</option>
            {checklistImportanceSchema.options.map((importance) => (
              <option key={importance} value={importance}>
                {IMPORTANCE_LABELS[importance]}
              </option>
            ))}
          </select>
        </TableCell>
        <TableCell className={'whitespace-normal'}>
          <div className={'flex flex-wrap items-center gap-x-2'}>
            <input
              type={'date'}
              aria-label={`Due date for ${item.title}`}
              className={fieldClass}
              key={item.due_at}
              defaultValue={item.due_at?.slice(0, 10)}
              disabled={pending}
              onChange={(event) =>
                setDetails({ due_on: event.target.value || null })
              }
            />
            {item.due_set_manually ? (
              <Button
                size={'sm'}
                variant={'link'}
                className={'h-auto px-0'}
                disabled={pending}
                onClick={() => setDetails({ use_scheduled_date: true })}
              >
                Use scheduled date
              </Button>
            ) : null}
            {isOverdue(item.due_at, dueDone(item), today) ? (
              <span className={'text-destructive text-xs font-medium'}>
                Overdue
              </span>
            ) : null}
          </div>
        </TableCell>
        <TableCell className={'whitespace-normal'}>
          {item.review_due_at === null ? (
            'Not set'
          ) : (
            <DueDate
              at={item.review_due_at}
              done={item.status === 'reviewed'}
            />
          )}
        </TableCell>
      </TableRow>
      {isOpen ? (
        <TableRow className={'hover:bg-transparent'}>
          <TableCell colSpan={COLUMNS} className={'bg-muted/20'}>
            <ChecklistItemDetails
              item={item}
              team={team}
              documents={documents}
            />
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

const NO_DOCUMENT = '';

const noteTime = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

type Note = Pick<
  Tables<'checklist_item_note'>,
  'id' | 'body' | 'author_user_id' | 'created_at'
>;

function ChecklistItemDetails({
  item,
  team,
  documents,
}: {
  item: Item;
  team: Member[];
  documents: DataRoomDocument[];
}) {
  const { refusal, pending, run } = useRefusableAction();
  const notes = useNotes(item.id);
  const names = new Map<string | null, string>(
    team.map((member) => [member.userId, member.name]),
  );
  const [note, setNote] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [question, setQuestion] = useState(item.title);
  const [questionDetails, setQuestionDetails] = useState('');
  const linked = documents.find(
    (document) => document.id === item.linked_document_id,
  );

  return (
    <div className={'grid gap-6 py-2 md:grid-cols-[1fr_2fr]'}>
      <div className={'flex flex-col gap-4'}>
        <div className={'flex flex-col gap-1.5'}>
          <span className={'text-sm font-medium'}>Document</span>
          <div className={'flex flex-wrap items-center gap-2'}>
            <select
              aria-label={`Document for ${item.title}`}
              className={`${fieldClass} max-w-64`}
              value={linked?.id ?? NO_DOCUMENT}
              disabled={pending}
              onChange={(event) =>
                run(() =>
                  linkChecklistDocument({
                    deal_id: item.deal_id,
                    id: item.id,
                    document_id: event.target.value || null,
                  }),
                )
              }
            >
              <option value={NO_DOCUMENT}>None linked</option>
              {documents.map((document) => (
                <option key={document.id} value={document.id}>
                  {document.name}
                </option>
              ))}
            </select>
            {linked ? (
              <DataRoomDocumentLink
                dealId={item.deal_id}
                documentId={linked.id}
              />
            ) : null}
          </div>
        </div>
        {isAsking ? (
          <form
            className={'flex flex-col gap-2'}
            onSubmit={(event) => {
              event.preventDefault();
              run(
                () =>
                  requestChecklistItemFromSeller({
                    checklistItemId: item.id,
                    title: question,
                    body: questionDetails,
                  }),
                () => setIsAsking(false),
              );
            }}
          >
            <Label htmlFor={`request-${item.id}-title`}>
              Question for the seller
            </Label>
            <Input
              id={`request-${item.id}-title`}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
            />
            <Label htmlFor={`request-${item.id}-body`}>Details</Label>
            <Textarea
              id={`request-${item.id}-body`}
              value={questionDetails}
              onChange={(event) => setQuestionDetails(event.target.value)}
            />
            <div className={'flex gap-2'}>
              <Button
                type={'submit'}
                size={'sm'}
                disabled={pending || question.trim() === ''}
              >
                Send to the seller room
              </Button>
              <Button
                type={'button'}
                size={'sm'}
                variant={'ghost'}
                onClick={() => setIsAsking(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <Button
            size={'sm'}
            variant={'outline'}
            className={'w-fit'}
            onClick={() => setIsAsking(true)}
          >
            Request from seller
          </Button>
        )}
        {refusal ? (
          <p role={'alert'} className={'text-destructive text-sm'}>
            {refusal}
          </p>
        ) : null}
      </div>
      <div className={'flex flex-col gap-3'}>
        <span className={'text-sm font-medium'}>Notes</span>
        {notes.list.length === 0 ? (
          <p className={'text-muted-foreground text-sm'}>No notes yet.</p>
        ) : (
          <ol className={'flex flex-col gap-3 border-l pl-3'}>
            {notes.list.map((each) => (
              <li key={each.id} className={'flex flex-col gap-0.5'}>
                <span className={'text-muted-foreground text-xs'}>
                  <span className={'text-foreground font-medium'}>
                    {names.get(each.author_user_id) ?? 'A former team member'}
                  </span>{' '}
                  {noteTime.format(new Date(each.created_at))}
                </span>
                <p className={'text-sm whitespace-pre-wrap'}>{each.body}</p>
              </li>
            ))}
          </ol>
        )}
        <form
          className={'flex items-end gap-2'}
          onSubmit={(event) => {
            event.preventDefault();
            run(
              () =>
                postChecklistNote({
                  deal_id: item.deal_id,
                  id: item.id,
                  body: note,
                }),
              () => {
                setNote('');
                notes.reload();
              },
            );
          }}
        >
          <Input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            aria-label={'Add a note'}
            placeholder={'Add a note'}
          />
          <Button
            type={'submit'}
            size={'sm'}
            variant={'outline'}
            disabled={pending || note.trim() === ''}
          >
            Post
          </Button>
        </form>
      </div>
    </div>
  );
}

function useNotes(itemId: string) {
  const client = useSupabase();
  const [list, setList] = useState<Note[]>([]);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    client
      .from('checklist_item_note')
      .select('id, body, author_user_id, created_at')
      .eq('checklist_item_id', itemId)
      .order('created_at', { ascending: true })
      .then(({ data }) => setList(data!));
  }, [client, itemId, version]);

  return { list, reload: () => setVersion(version + 1) };
}

interface ChecklistGroup {
  key: string;
  items: Item[];
}

function groupChecklist(items: Item[]): ChecklistGroup[] {
  const byKey = new Map<string, Item[]>();

  for (const item of items) {
    const key = item.kind ?? item.category ?? 'other';
    const bucket = byKey.get(key) ?? [];
    bucket.push(item);
    byKey.set(key, bucket);
  }

  return [...byKey].map(([key, groupItems]) => ({ key, items: groupItems }));
}
