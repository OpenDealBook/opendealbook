import Link from 'next/link';

import type { MyTodos } from '@odb/deals';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';

export function MyTodosView(props: {
  data: MyTodos;
  dealHref: (dealId: string) => string;
}) {
  return (
    <div className={'flex flex-col gap-6'}>
      <Card>
        <CardHeader>
          <CardTitle>Assigned to me</CardTitle>
        </CardHeader>
        <CardContent className={'flex flex-col gap-4'}>
          {props.data.assigned.length === 0 ? (
            <p className={'text-muted-foreground text-sm'}>
              Nothing assigned to you
            </p>
          ) : (
            props.data.assigned.map((group) => (
              <div key={group.deal.id} className={'flex flex-col gap-1'}>
                <Link
                  href={props.dealHref(group.deal.id)}
                  className={'text-sm font-medium underline'}
                >
                  {group.deal.description ?? 'Untitled deal'}
                </Link>
                <ul className={'flex flex-col gap-1 pl-4'}>
                  {group.items.map((item) => (
                    <li
                      key={item.id}
                      className={'text-muted-foreground text-sm'}
                    >
                      {item.title} · {item.status}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>My to-dos</CardTitle>
        </CardHeader>
        <CardContent>
          {props.data.personal.length === 0 ? (
            <p className={'text-muted-foreground text-sm'}>No personal to-dos</p>
          ) : (
            <ul className={'flex flex-col gap-2'}>
              {props.data.personal.map((todo) => (
                <li
                  key={todo.id}
                  className={'flex items-center gap-2 text-sm'}
                >
                  <span
                    className={
                      todo.done ? 'text-muted-foreground line-through' : ''
                    }
                  >
                    {todo.title}
                  </span>
                  {todo.deal_id ? (
                    <Link
                      href={props.dealHref(todo.deal_id)}
                      className={'text-muted-foreground ml-auto text-xs underline'}
                    >
                      View deal
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
