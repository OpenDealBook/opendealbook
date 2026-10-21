import Link from 'next/link';

import type { MyTodos, MyWorkItem } from '@odb/deals';
import { itemAnchor } from '@odb/notifications/relay';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';

import { DueDate } from './due-date';

const KIND_LABEL = { checklist: 'Checklist', todo: 'To-do' } as const;
const ITEM_KIND = { checklist: 'checklist-item', todo: 'todo' } as const;

function WorkRow(props: {
  item: MyWorkItem;
  dealHref: (dealId: string) => string;
}) {
  const { item } = props;

  return (
    <li
      id={itemAnchor({ kind: ITEM_KIND[item.kind], id: item.id })}
      className={'flex flex-wrap items-center gap-2 text-sm'}
    >
      <span className={'text-muted-foreground text-xs'}>
        {KIND_LABEL[item.kind]}
      </span>
      <span className={item.done ? 'text-muted-foreground line-through' : ''}>
        {item.title}
      </span>
      {item.kind === 'checklist' ? (
        <span className={'text-muted-foreground text-xs'}>{item.status}</span>
      ) : null}
      {item.due_at === null ? null : (
        <span className={'text-muted-foreground text-xs'}>
          Due <DueDate at={item.due_at} done={item.done} />
        </span>
      )}
      {item.deal === null ? null : (
        <Link
          href={props.dealHref(item.deal.id)}
          className={'text-muted-foreground ml-auto text-xs underline'}
        >
          {item.deal.name}
        </Link>
      )}
    </li>
  );
}

function WorkSection(props: {
  title: string;
  items: MyTodos;
  dealHref: (dealId: string) => string;
}) {
  return (
    <section>
      <Card>
        <CardHeader>
          <CardTitle>{props.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className={'flex flex-col gap-2'}>
            {props.items.map((item) => (
              <WorkRow key={item.id} item={item} dealHref={props.dealHref} />
            ))}
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}

export function MyTodosView(props: {
  data: MyTodos;
  dealHref: (dealId: string) => string;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = (item: MyWorkItem) =>
    !item.done && item.due_at !== null && item.due_at.slice(0, 10) < today;
  const overdue = props.data.filter(isOverdue);
  const rest = props.data.filter((item) => !isOverdue(item));

  return (
    <div className={'flex flex-col gap-6'}>
      <p className={'text-muted-foreground text-sm'}>
        Checklist items you own and to-dos assigned to you, across this
        team&apos;s deals.
      </p>
      {props.data.length === 0 ? (
        <p className={'text-muted-foreground text-sm'}>
          Nothing assigned to you
        </p>
      ) : null}
      {overdue.length === 0 ? null : (
        <WorkSection
          title={'Overdue'}
          items={overdue}
          dealHref={props.dealHref}
        />
      )}
      {rest.length === 0 ? null : (
        <WorkSection
          title={'Everything else'}
          items={rest}
          dealHref={props.dealHref}
        />
      )}
    </div>
  );
}
