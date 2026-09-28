'use client';

import { useTransition } from 'react';

import Link from 'next/link';

import { Button } from '@tuckin/ui/button';

import { reloadSampleData } from '../_lib/trial-actions';

interface TrialBannerProps {
  accountId: string;
  isActive: boolean;
  endsAt: string | null;
  billingHref: string;
}

const DAY_MS = 1000 * 60 * 60 * 24;

function daysLeft(endsAt: string): number {
  return Math.max(
    0,
    Math.ceil((new Date(endsAt).getTime() - Date.now()) / DAY_MS),
  );
}

export function TrialBanner({
  accountId,
  isActive,
  endsAt,
  billingHref,
}: TrialBannerProps) {
  const [isPending, startTransition] = useTransition();

  if (!endsAt) {
    return null;
  }

  function onReload() {
    startTransition(async () => {
      await reloadSampleData({ accountId });
    });
  }

  return (
    <div
      data-slot={'trial-banner'}
      className={
        'bg-muted flex items-center justify-between gap-4 border-b px-6 py-2 text-sm'
      }
    >
      {isActive ? (
        <span>{daysLeft(endsAt)} days left in your trial</span>
      ) : (
        <span className={'text-muted-foreground'}>
          Your trial has ended.{' '}
          <Link href={billingHref} className={'font-medium underline'}>
            Upgrade to keep working
          </Link>
        </span>
      )}

      <Button
        type={'button'}
        size={'sm'}
        variant={'outline'}
        onClick={onReload}
        disabled={isPending}
      >
        {isPending ? 'Loading' : 'Reload sample deals'}
      </Button>
    </div>
  );
}
