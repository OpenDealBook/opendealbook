'use client';

import { useSyncExternalStore } from 'react';

const neverChanges = () => () => {};

function localTime(iso: string) {
  const at = new Date(iso);
  const day = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(at);
  const time = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(at);

  return `${day} ${time}`;
}

export function SavedAt({ iso }: { iso: string }) {
  const text = useSyncExternalStore(
    neverChanges,
    () => localTime(iso),
    () => '',
  );

  return <time dateTime={iso}>{text}</time>;
}
