'use client';

import { useState, useTransition } from 'react';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import type { DealListFilters } from '@odb/deals';
import { deleteSavedView, saveView } from '@odb/deals/server';
import type { Tables } from '@odb/supabase';
import { Button } from '@odb/ui/button';
import { Checkbox } from '@odb/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@odb/ui/dropdown-menu';
import { Input } from '@odb/ui/input';

import {
  DEAL_COLUMNS,
  DEAL_PARAM,
  DEFAULT_VISIBLE_COLUMNS,
  type DealColumnKey,
  type DealView,
  parseDealParams,
  viewToSearchParams,
} from './deals-search-params';

type SavedView = Tables<'saved_view'>;

export function SavedViewsBar({
  views,
  accountId,
  view,
}: {
  views: SavedView[];
  accountId: string;
  view: DealView;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [name, setName] = useState('');
  const [pending, startTransition] = useTransition();

  function navigate(params: URLSearchParams) {
    params.delete(DEAL_PARAM.cursor);
    const query = params.toString();
    router.replace(query.length > 0 ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }

  function applyView(saved: SavedView) {
    navigate(
      viewToSearchParams({
        filters: (saved.filters ?? {}) as unknown as DealListFilters,
        sort: typeof saved.sort === 'string' ? saved.sort : undefined,
        visibleColumns: Array.isArray(saved.visible_columns)
          ? (saved.visible_columns as string[])
          : undefined,
      }),
    );
  }

  function currentColumns(): DealColumnKey[] {
    const raw = searchParams.get(DEAL_PARAM.cols);
    if (raw === null) {
      return DEFAULT_VISIBLE_COLUMNS;
    }
    const chosen = new Set(raw.split(','));
    return DEFAULT_VISIBLE_COLUMNS.filter((key) => chosen.has(key));
  }

  function toggleColumn(key: DealColumnKey) {
    const visible = new Set(currentColumns());
    if (visible.has(key)) {
      visible.delete(key);
    } else {
      visible.add(key);
    }
    const next = DEFAULT_VISIBLE_COLUMNS.filter((column) => visible.has(column));
    const params = new URLSearchParams(searchParams);
    if (next.length === DEFAULT_VISIBLE_COLUMNS.length) {
      params.delete(DEAL_PARAM.cols);
    } else {
      params.set(DEAL_PARAM.cols, next.join(','));
    }
    navigate(params);
  }

  function handleSave() {
    const parsed = parseDealParams(
      Object.fromEntries(searchParams.entries()),
    );
    startTransition(async () => {
      await saveView({
        account_id: accountId,
        name,
        filters: parsed.filters as Record<string, unknown>,
        sort: parsed.sort,
        visible_columns: parsed.visibleColumns,
      });
      setName('');
      router.refresh();
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteSavedView({ id });
      router.refresh();
    });
  }

  const visible = currentColumns();

  return (
    <div className={'flex flex-wrap items-center gap-2'}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size={'sm'} variant={'outline'}>
            Views
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={'start'}>
          <DropdownMenuLabel>Saved views</DropdownMenuLabel>
          {views.length === 0 ? (
            <DropdownMenuItem disabled>No saved views</DropdownMenuItem>
          ) : (
            views.map((saved) => (
              <DropdownMenuItem
                key={saved.id}
                className={'flex items-center justify-between gap-4'}
                onSelect={() => applyView(saved)}
              >
                <span>{saved.name}</span>
                <button
                  type={'button'}
                  className={'text-muted-foreground text-xs'}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    handleDelete(saved.id);
                  }}
                >
                  Delete
                </button>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Input
        className={'h-8 w-40'}
        placeholder={'Name this view'}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <Button
        size={'sm'}
        variant={'outline'}
        disabled={pending || name.length === 0}
        onClick={handleSave}
      >
        Save view
      </Button>

      {view === 'table' ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size={'sm'} variant={'outline'}>
              Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align={'start'}>
            <DropdownMenuLabel>Columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {DEAL_COLUMNS.map((column) => (
              <DropdownMenuItem
                key={column.key}
                onSelect={(event) => {
                  event.preventDefault();
                  toggleColumn(column.key);
                }}
                className={'flex items-center gap-2'}
              >
                <Checkbox checked={visible.includes(column.key)} />
                <span>{column.label}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
