'use client';

import { useState } from 'react';

import {
  addTemplateItem,
  createChecklistTemplate,
  removeTemplateItem,
  renameChecklistTemplate,
  reorderTemplateItems,
  setDefaultChecklistTemplate,
  updateTemplateItem,
} from '@odb/diligence/server';
import { Alert, AlertDescription } from '@odb/ui/alert';
import { Badge } from '@odb/ui/badge';
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

import { useRefusableAction } from '../../../../_components/use-refusable-action';
import {
  type ChecklistKind,
  hasOffset,
  offsetLabel,
  shownOffset,
  storedOffset,
} from '../offset';

const KINDS: { kind: ChecklistKind; heading: string }[] = [
  { kind: 'diligence', heading: 'Diligence' },
  { kind: 'closing', heading: 'Closing' },
  { kind: 'post_close', heading: 'Post-close' },
  { kind: 'offer', heading: 'Offer' },
];

const OWNER_ROLES = [
  'buyer',
  'attorney',
  'cpa',
  'broker',
  'seller',
  'sales_team',
] as const;

const IMPORTANCES = ['required', 'nice_to_have', 'na'] as const;

const NONE = 'none';

interface TemplateItem {
  id: string;
  title: string;
  category: string | null;
  due_offset_days: number | null;
  review_offset_days: number;
  owner_role: string | null;
  importance: string | null;
}

interface Template {
  id: string;
  name: string;
  kind: string | null;
  is_default: boolean;
  items: TemplateItem[];
}

function Refusal({ text }: { text: string | null }) {
  return text ? (
    <Alert variant={'destructive'}>
      <AlertDescription>{text}</AlertDescription>
    </Alert>
  ) : null;
}

function OptionSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  options: readonly string[];
  onChange: (value: string | null) => void;
}) {
  return (
    <div className={'flex flex-col gap-1'}>
      <Label className={'text-xs'}>{label}</Label>
      <Select
        value={value ?? NONE}
        onValueChange={(next) => onChange(next === NONE ? null : next)}
      >
        <SelectTrigger aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Not set</SelectItem>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option.replace('_', ' ')}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function ItemFields({
  item,
  kind,
  onDone,
}: {
  item: TemplateItem;
  kind: ChecklistKind;
  onDone: () => void;
}) {
  const { refusal, pending: isPending, run: submit } = useRefusableAction();
  const [title, setTitle] = useState(item.title);
  const [category, setCategory] = useState(item.category ?? '');
  const [due, setDue] = useState(
    item.due_offset_days === null || !hasOffset(kind)
      ? ''
      : String(shownOffset(kind, item.due_offset_days)),
  );
  const [review, setReview] = useState(String(item.review_offset_days));
  const [ownerRole, setOwnerRole] = useState(item.owner_role);
  const [importance, setImportance] = useState(item.importance);

  function onSave() {
    submit(
      () =>
        updateTemplateItem({
          itemId: item.id,
          title,
          category: category === '' ? null : category,
          dueOffsetDays:
            due === '' || !hasOffset(kind)
              ? null
              : storedOffset(kind, Number(due)),
          reviewOffsetDays: Number(review),
          ownerRole: ownerRole as (typeof OWNER_ROLES)[number] | null,
          importance: importance as (typeof IMPORTANCES)[number] | null,
        }),
      onDone,
    );
  }

  return (
    <div className={'flex flex-col gap-3 py-2'}>
      <div className={'grid gap-3 md:grid-cols-5'}>
        <div className={'flex flex-col gap-1 md:col-span-2'}>
          <Label className={'text-xs'}>Title</Label>
          <Input
            aria-label={'Title'}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <div className={'flex flex-col gap-1'}>
          <Label className={'text-xs'}>Group</Label>
          <Input
            aria-label={'Group'}
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          />
        </div>
        {hasOffset(kind) ? (
          <div className={'flex flex-col gap-1'}>
            <Label className={'text-xs'}>Due, {offsetLabel(kind)}</Label>
            <Input
              aria-label={'Due'}
              type={'number'}
              min={0}
              value={due}
              onChange={(event) => setDue(event.target.value)}
            />
          </div>
        ) : null}
        <div className={'flex flex-col gap-1'}>
          <Label className={'text-xs'}>Review days</Label>
          <Input
            aria-label={'Review days'}
            type={'number'}
            min={0}
            value={review}
            onChange={(event) => setReview(event.target.value)}
          />
        </div>
        <OptionSelect
          label={'Owner'}
          value={ownerRole}
          options={OWNER_ROLES}
          onChange={setOwnerRole}
        />
        <OptionSelect
          label={'Importance'}
          value={importance}
          options={IMPORTANCES}
          onChange={setImportance}
        />
      </div>
      <div className={'flex flex-wrap items-center gap-2'}>
        <Button size={'sm'} disabled={isPending} onClick={onSave}>
          Save item
        </Button>
        <Button
          size={'sm'}
          variant={'outline'}
          disabled={isPending}
          onClick={onDone}
        >
          Cancel
        </Button>
      </div>
      <Refusal text={refusal} />
    </div>
  );
}

function ItemRow({
  item,
  kind,
  isFirst,
  isLast,
  onMove,
}: {
  item: TemplateItem;
  kind: ChecklistKind;
  isFirst: boolean;
  isLast: boolean;
  onMove: (direction: -1 | 1) => void;
}) {
  const { refusal, pending: isPending, run: submit } = useRefusableAction();
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <TableRow>
        <TableCell colSpan={7}>
          <ItemFields
            item={item}
            kind={kind}
            onDone={() => setEditing(false)}
          />
        </TableCell>
      </TableRow>
    );
  }

  return (
    <>
      <TableRow>
        <TableCell className={'font-medium whitespace-normal'}>
          {item.title}
        </TableCell>
        <TableCell>{item.category}</TableCell>
        <TableCell>
          {hasOffset(kind) && item.due_offset_days !== null
            ? `${shownOffset(kind, item.due_offset_days)} ${offsetLabel(kind)}`
            : null}
        </TableCell>
        <TableCell className={'tabular-nums'}>
          {item.review_offset_days}
        </TableCell>
        <TableCell>{item.owner_role?.replace('_', ' ')}</TableCell>
        <TableCell>{item.importance?.replace('_', ' ')}</TableCell>
        <TableCell>
          <div className={'flex justify-end gap-1'}>
            <Button
              size={'sm'}
              variant={'ghost'}
              aria-label={`Edit ${item.title}`}
              disabled={isPending}
              onClick={() => setEditing(true)}
            >
              Edit
            </Button>
            <Button
              size={'sm'}
              variant={'ghost'}
              aria-label={`Move ${item.title} up`}
              disabled={isPending || isFirst}
              onClick={() => onMove(-1)}
            >
              Up
            </Button>
            <Button
              size={'sm'}
              variant={'ghost'}
              aria-label={`Move ${item.title} down`}
              disabled={isPending || isLast}
              onClick={() => onMove(1)}
            >
              Down
            </Button>
            <Button
              size={'sm'}
              variant={'ghost'}
              aria-label={`Remove ${item.title}`}
              disabled={isPending}
              onClick={() =>
                submit(() => removeTemplateItem({ itemId: item.id }))
              }
            >
              Remove
            </Button>
          </div>
        </TableCell>
      </TableRow>
      {refusal ? (
        <TableRow>
          <TableCell colSpan={7}>
            <Refusal text={refusal} />
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

function TemplateCard({
  template,
  kind,
}: {
  template: Template;
  kind: ChecklistKind;
}) {
  const { refusal, pending: isPending, run: submit } = useRefusableAction();
  const [name, setName] = useState(template.name);
  const [newTitle, setNewTitle] = useState('');

  function move(index: number, direction: -1 | 1) {
    const ids = template.items.map((item) => item.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + direction, 0, moved!);
    submit(() =>
      reorderTemplateItems({ templateId: template.id, itemIds: ids }),
    );
  }

  return (
    <Card>
      <CardHeader className={'flex flex-row items-center gap-3'}>
        <CardTitle className={'sr-only'}>{template.name}</CardTitle>
        <Input
          aria-label={'Template name'}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Button
          variant={'outline'}
          disabled={isPending || name === template.name}
          onClick={() =>
            submit(() =>
              renameChecklistTemplate({ templateId: template.id, name }),
            )
          }
        >
          Rename
        </Button>
        {template.is_default ? (
          <Badge>Default</Badge>
        ) : (
          <Button
            variant={'outline'}
            disabled={isPending}
            onClick={() =>
              submit(() =>
                setDefaultChecklistTemplate({ templateId: template.id }),
              )
            }
          >
            Make default
          </Button>
        )}
      </CardHeader>
      <CardContent className={'flex flex-col gap-4'}>
        {template.items.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Group</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Review days</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Importance</TableHead>
                <TableHead>
                  <span className={'sr-only'}>Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {template.items.map((item, index) => (
                <ItemRow
                  key={`${item.id}-${item.title}`}
                  item={item}
                  kind={kind}
                  isFirst={index === 0}
                  isLast={index === template.items.length - 1}
                  onMove={(direction) => move(index, direction)}
                />
              ))}
            </TableBody>
          </Table>
        ) : null}
        <div className={'flex items-end gap-2'}>
          <div className={'flex flex-1 flex-col gap-1'}>
            <Label className={'text-xs'}>New item</Label>
            <Input
              aria-label={'New item title'}
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
            />
          </div>
          <Button
            disabled={isPending || newTitle === ''}
            onClick={() =>
              submit(
                () =>
                  addTemplateItem({
                    templateId: template.id,
                    title: newTitle,
                    sortOrder: template.items.length,
                  }),
                () => setNewTitle(''),
              )
            }
          >
            Add item
          </Button>
        </div>
        <Refusal text={refusal} />
      </CardContent>
    </Card>
  );
}

function ReadOnlyTemplate({
  template,
  kind,
}: {
  template: Template;
  kind: ChecklistKind;
}) {
  return (
    <Card>
      <CardHeader className={'flex flex-row items-center gap-3'}>
        <CardTitle>{template.name}</CardTitle>
        {template.is_default ? <Badge>Default</Badge> : null}
      </CardHeader>
      <CardContent>
        <ul className={'flex flex-col gap-2 text-sm'}>
          {template.items.map((item) => (
            <li key={item.id} className={'flex flex-col'}>
              <span className={'font-medium'}>{item.title}</span>
              <span className={'text-muted-foreground'}>
                {[
                  item.category,
                  hasOffset(kind) && item.due_offset_days !== null
                    ? `${shownOffset(kind, item.due_offset_days)} ${offsetLabel(kind)}`
                    : null,
                  `${item.review_offset_days} review days`,
                  item.owner_role?.replace('_', ' '),
                  item.importance?.replace('_', ' '),
                ]
                  .filter(Boolean)
                  .join(', ')}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function NewTemplateForm({ accountId }: { accountId: string }) {
  const { refusal, pending: isPending, run: submit } = useRefusableAction();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ChecklistKind>('diligence');

  return (
    <Card>
      <CardHeader>
        <CardTitle>New template</CardTitle>
      </CardHeader>
      <CardContent className={'flex flex-col gap-3'}>
        <div className={'flex items-end gap-2'}>
          <div className={'flex flex-1 flex-col gap-1'}>
            <Label htmlFor={'new-template-name'}>Name</Label>
            <Input
              id={'new-template-name'}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <Select
            value={kind}
            onValueChange={(value) => setKind(value as ChecklistKind)}
          >
            <SelectTrigger aria-label={'Kind'} className={'w-40'}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KINDS.map((option) => (
                <SelectItem key={option.kind} value={option.kind}>
                  {option.heading}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            disabled={isPending || name === ''}
            onClick={() =>
              submit(
                () => createChecklistTemplate({ accountId, name, kind }),
                () => setName(''),
              )
            }
          >
            Create template
          </Button>
        </div>
        <Refusal text={refusal} />
      </CardContent>
    </Card>
  );
}

export function ChecklistEditor({
  accountId,
  canManage,
  templates,
}: {
  accountId: string;
  canManage: boolean;
  templates: Template[];
}) {
  return (
    <div className={'flex flex-col gap-8'}>
      {canManage ? <NewTemplateForm accountId={accountId} /> : null}
      {KINDS.map(({ kind, heading }) => {
        const ofKind = templates.filter((template) => template.kind === kind);

        return (
          <section key={kind} className={'flex flex-col gap-3'}>
            <h2 className={'text-lg font-semibold'}>{heading}</h2>
            {ofKind.length === 0 ? (
              <p className={'text-muted-foreground text-sm'}>
                No {heading.toLowerCase()} templates yet.
              </p>
            ) : (
              ofKind.map((template) =>
                canManage ? (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    kind={kind}
                  />
                ) : (
                  <ReadOnlyTemplate
                    key={template.id}
                    template={template}
                    kind={kind}
                  />
                ),
              )
            )}
          </section>
        );
      })}
    </div>
  );
}
