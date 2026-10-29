'use client';

import { useRef } from 'react';

import { flushSync } from 'react-dom';

import { MERGE_FIELD_LABELS } from '@odb/outreach-app';
import { Button } from '@odb/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@odb/ui/dropdown-menu';

const GROUP_LABELS: Record<string, string> = {
  recipient: 'Recipient',
  firm: 'Firm',
  dealBox: 'Deal box',
  sender: 'Sender',
};

export function MergeFieldPicker({
  fieldId,
  tokens,
  value,
  onChange,
}: {
  fieldId: string;
  tokens: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  const caret = useRef<number | null>(null);
  const groups = Object.keys(GROUP_LABELS)
    .map((group) => tokens.filter((token) => token.startsWith(`${group}.`)))
    .filter((members) => members.length > 0);

  function field() {
    return document.getElementById(fieldId) as HTMLInputElement | HTMLTextAreaElement;
  }

  function insert(token: string) {
    const { selectionStart, selectionEnd } = field();
    const placed = `{{ ${token} }}`;
    caret.current = selectionStart! + placed.length;
    flushSync(() => onChange(value.slice(0, selectionStart!) + placed + value.slice(selectionEnd!)));
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type={'button'} size={'sm'} variant={'ghost'} className={'h-7 px-2 text-xs'}>
          Insert field
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={'end'}
        onCloseAutoFocus={(event) => {
          if (caret.current === null) {
            return;
          }
          event.preventDefault();
          field().focus();
          field().setSelectionRange(caret.current, caret.current);
          caret.current = null;
        }}
      >
        {groups.map((members) => (
          <DropdownMenuGroup key={members[0]}>
            <DropdownMenuLabel className={'text-muted-foreground text-xs'}>
              {GROUP_LABELS[members[0]!.split('.')[0]!]}
            </DropdownMenuLabel>
            {members.map((token) => (
              <DropdownMenuItem key={token} onSelect={() => insert(token)}>
                {MERGE_FIELD_LABELS[token]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
