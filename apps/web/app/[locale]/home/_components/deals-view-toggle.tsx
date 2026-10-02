'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { Button } from '@odb/ui/button';

import { DEAL_PARAM, type DealView } from './deals-search-params';

const VIEWS: { value: DealView; label: string }[] = [
  { value: 'cards', label: 'Cards' },
  { value: 'table', label: 'Table' },
];

export function DealsViewToggle({ view }: { view: DealView }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function select(next: DealView) {
    const params = new URLSearchParams(searchParams);
    params.delete(DEAL_PARAM.cursor);
    params.set(DEAL_PARAM.view, next);
    const query = params.toString();
    router.replace(query.length > 0 ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }

  return (
    <div className={'flex items-center justify-end gap-1'}>
      {VIEWS.map((option) => (
        <Button
          key={option.value}
          size={'sm'}
          variant={view === option.value ? 'default' : 'outline'}
          onClick={() => select(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
