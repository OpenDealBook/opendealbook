'use client';

import { useSyncExternalStore } from 'react';

const neverChanges = () => () => {};

const format = { dateStyle: 'medium', timeStyle: 'short' } as const;

export function LocalTime({ at }: { at: string }) {
  // The server cannot know the reader's time zone, so it renders UTC and the browser swaps in local time after hydration without a mismatch.
  const text = useSyncExternalStore(
    neverChanges,
    () => new Date(at).toLocaleString(undefined, format),
    () =>
      `${new Date(at).toLocaleString('en-US', { ...format, timeZone: 'UTC' })} UTC`,
  );

  return <time dateTime={at}>{text}</time>;
}
