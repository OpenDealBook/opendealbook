'use client';

import * as React from 'react';

import { Button } from '#components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#components/dropdown-menu';
import { Input } from '#components/input';
import { StageChip } from '#components/stage-chip';
import { ChevronsUpDownIcon } from 'lucide-react';

type Deal = {
  id: string;
  name: string;
  stage: string;
  daysInStage?: number;
};

function DealSwitcher({
  deals,
  activeDealId,
  onSelect,
  onAllDeals,
}: {
  deals: Deal[];
  activeDealId?: string;
  onSelect: (id: string) => void;
  onAllDeals?: () => void;
}) {
  const [query, setQuery] = React.useState('');
  const activeDeal = deals.find((deal) => deal.id === activeDealId);
  const filtered = deals.filter((deal) =>
    deal.name.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          data-slot="deal-switcher-trigger"
          className="w-full justify-between gap-2"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate">
              {activeDeal ? activeDeal.name : 'Select deal'}
            </span>
            {activeDeal ? <StageChip stage={activeDeal.stage} /> : null}
            {activeDeal?.daysInStage !== undefined ? (
              <span
                data-slot="deal-switcher-days"
                className="text-muted-foreground text-xs"
              >
                {activeDeal.daysInStage}d
              </span>
            ) : null}
          </span>
          <ChevronsUpDownIcon className="opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        data-slot="deal-switcher-content"
        className="w-(--radix-dropdown-menu-trigger-width)"
      >
        <Input
          data-slot="deal-switcher-filter"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => event.stopPropagation()}
          placeholder="Filter deals"
          aria-label="Filter deals"
          className="mb-1"
        />
        {filtered.map((deal) => (
          <DropdownMenuItem
            key={deal.id}
            data-active={deal.id === activeDealId}
            onSelect={() => onSelect(deal.id)}
            className="justify-between gap-2"
          >
            <span className="truncate">{deal.name}</span>
            <span className="flex shrink-0 items-center gap-2">
              <StageChip stage={deal.stage} />
              {deal.daysInStage !== undefined ? (
                <span className="text-muted-foreground text-xs">
                  {deal.daysInStage}d
                </span>
              ) : null}
            </span>
          </DropdownMenuItem>
        ))}
        {onAllDeals ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              data-slot="deal-switcher-all"
              onSelect={() => onAllDeals()}
            >
              All deals
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { DealSwitcher };
