'use client';

import { useSyncExternalStore } from 'react';

const neverChanges = () => () => {};

const twoDigits = (value: number) => String(value).padStart(2, '0');

function localToday() {
  const now = new Date();

  return `${now.getFullYear()}-${twoDigits(now.getMonth() + 1)}-${twoDigits(now.getDate())}`;
}

function utcToday() {
  return new Date().toISOString().slice(0, 10);
}

export function useToday() {
  return useSyncExternalStore(neverChanges, localToday, utcToday);
}

export function isOverdue(at: string | null, done: boolean, today: string) {
  return at !== null && !done && at.slice(0, 10) < today;
}

export function DueDate({ at, done }: { at: string; done: boolean }) {
  const today = useToday();
  const text = new Date(at).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    dateStyle: 'long',
  });

  if (!isOverdue(at, done, today)) {
    return <span>{text}</span>;
  }

  return (
    <span className={'text-destructive'}>
      {text} <span className={'sr-only'}>Overdue</span>
    </span>
  );
}
