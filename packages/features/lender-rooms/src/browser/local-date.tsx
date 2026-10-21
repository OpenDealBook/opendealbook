'use client';

import { useSyncExternalStore } from 'react';

const neverChanges = () => () => {};

const format = { dateStyle: 'medium' } as const;

export function LocalDate({ at }: { at: string }) {
  const text = useSyncExternalStore(
    neverChanges,
    () => new Date(at).toLocaleDateString(undefined, format),
    () =>
      new Date(at).toLocaleDateString('en-US', { ...format, timeZone: 'UTC' }),
  );

  return <time dateTime={at}>{text}</time>;
}
