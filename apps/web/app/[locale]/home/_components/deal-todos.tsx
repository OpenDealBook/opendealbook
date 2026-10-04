'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { createTodo, deleteTodo, toggleTodo } from '@odb/deals/server';
import { Button } from '@odb/ui/button';
import { Checkbox } from '@odb/ui/checkbox';
import { Input } from '@odb/ui/input';

interface TodoRow {
  id: string;
  title: string;
  done: boolean;
}

export function DealTodos(props: {
  accountId: string;
  dealId: string;
  todos: TodoRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState('');

  function run(action: () => Promise<unknown>) {
    startTransition(async () => {
      await action();
      router.refresh();
    });
  }

  function add() {
    if (title.trim() === '') {
      return;
    }

    run(async () => {
      await createTodo({
        account_id: props.accountId,
        deal_id: props.dealId,
        title,
      });
      setTitle('');
    });
  }

  return (
    <div className={'flex flex-col gap-4'}>
      <div className={'flex gap-2'}>
        <Input
          value={title}
          placeholder={'Add a to-do'}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              add();
            }
          }}
        />
        <Button disabled={pending} onClick={add}>
          Add
        </Button>
      </div>

      {props.todos.length === 0 ? (
        <p className={'text-muted-foreground text-sm'}>No to-dos yet</p>
      ) : (
        <ul className={'flex flex-col gap-2'}>
          {props.todos.map((todo) => (
            <li key={todo.id} className={'flex items-center gap-3'}>
              <Checkbox
                checked={todo.done}
                disabled={pending}
                onCheckedChange={(checked) =>
                  run(() => toggleTodo({ id: todo.id, done: checked === true }))
                }
              />
              <span
                className={
                  todo.done
                    ? 'text-muted-foreground text-sm line-through'
                    : 'text-sm'
                }
              >
                {todo.title}
              </span>
              <Button
                variant={'ghost'}
                size={'sm'}
                className={'ml-auto'}
                disabled={pending}
                onClick={() => run(() => deleteTodo({ id: todo.id }))}
              >
                Delete
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
