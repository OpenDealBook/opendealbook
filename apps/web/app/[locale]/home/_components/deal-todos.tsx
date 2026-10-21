'use client';

import { useOptimistic, useState } from 'react';

import {
  assignTodo,
  createTodo,
  deleteTodo,
  toggleTodo,
} from '@odb/deals/server';
import { itemAnchor } from '@odb/notifications/relay';
import { Button } from '@odb/ui/button';
import { Checkbox } from '@odb/ui/checkbox';
import { Input } from '@odb/ui/input';

import { DueDate } from './due-date';
import { useRefusableAction } from './use-refusable-action';

interface TodoRow {
  id: string;
  title: string;
  done: boolean;
  due_at: string | null;
  user_id: string;
}

interface Member {
  userId: string;
  name: string;
}

const selectClass = 'bg-background h-9 rounded-md border px-2 text-sm';

const ADDING = 'adding';

function MemberSelect(props: {
  label: string;
  members: Member[];
  value: string;
  disabled: boolean;
  onChange: (userId: string) => void;
}) {
  return (
    <select
      aria-label={props.label}
      className={selectClass}
      value={props.value}
      disabled={props.disabled}
      onChange={(event) => props.onChange(event.target.value)}
    >
      {props.members.map((member) => (
        <option key={member.userId} value={member.userId}>
          {member.name}
        </option>
      ))}
    </select>
  );
}

export function DealTodos(props: {
  accountId: string;
  dealId: string;
  currentUserId: string;
  members: Member[];
  todos: TodoRow[];
}) {
  const { refusal, pending, run } = useRefusableAction();
  const [todos, addOptimistic] = useOptimistic(
    props.todos,
    (rows, row: TodoRow) => [...rows, row],
  );
  const [title, setTitle] = useState('');
  const [dueOn, setDueOn] = useState('');
  const [assignee, setAssignee] = useState(props.currentUserId);

  function add() {
    if (title.trim() === '') {
      return;
    }

    run(
      () => {
        addOptimistic({
          id: ADDING,
          title,
          done: false,
          due_at: dueOn === '' ? null : `${dueOn}T00:00:00Z`,
          user_id: assignee,
        });

        return createTodo({
          account_id: props.accountId,
          deal_id: props.dealId,
          title,
          due_on: dueOn === '' ? undefined : dueOn,
          assignee_user_id: assignee,
        });
      },
      () => {
        setTitle('');
        setDueOn('');
      },
    );
  }

  return (
    <div className={'flex flex-col gap-4'}>
      <div className={'flex flex-wrap gap-2'}>
        <Input
          className={'min-w-48 flex-1'}
          value={title}
          placeholder={'Add a to-do'}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              add();
            }
          }}
        />
        <Input
          type={'date'}
          aria-label={'Due date'}
          className={'w-44'}
          value={dueOn}
          onChange={(event) => setDueOn(event.target.value)}
        />
        <MemberSelect
          label={'Assign to'}
          members={props.members}
          value={assignee}
          disabled={pending}
          onChange={setAssignee}
        />
        <Button disabled={pending} onClick={add}>
          Add
        </Button>
      </div>

      {refusal ? (
        <p role={'alert'} className={'text-destructive text-sm'}>
          {refusal}
        </p>
      ) : null}

      {todos.length === 0 ? (
        <p className={'text-muted-foreground text-sm'}>No to-dos yet</p>
      ) : (
        <ul className={'flex flex-col gap-2'}>
          {todos.map((todo) => (
            <li
              key={todo.id}
              id={itemAnchor({ kind: 'todo', id: todo.id })}
              className={'flex flex-wrap items-center gap-3'}
            >
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
              {todo.due_at === null ? null : (
                <span className={'text-muted-foreground text-xs'}>
                  Due <DueDate at={todo.due_at} done={todo.done} />
                </span>
              )}
              {todo.id === ADDING ? (
                <span className={'text-muted-foreground ml-auto text-xs'}>
                  Adding
                </span>
              ) : (
                <>
                  <span className={'ml-auto'}>
                    <MemberSelect
                      label={`Assignee for ${todo.title}`}
                      members={props.members}
                      value={todo.user_id}
                      disabled={pending}
                      onChange={(userId) =>
                        run(() =>
                          assignTodo({ id: todo.id, assignee_user_id: userId }),
                        )
                      }
                    />
                  </span>
                  <Button
                    variant={'ghost'}
                    size={'sm'}
                    disabled={pending}
                    onClick={() => run(() => deleteTodo({ id: todo.id }))}
                  >
                    Delete
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
