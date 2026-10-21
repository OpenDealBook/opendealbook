'use client';

import { useSyncExternalStore } from 'react';

import type { RoomSort } from '../contents/listing';

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function useStoredChoice<Choice extends string>(
  storageKey: string,
  [fallback, ...others]: [Choice, ...Choice[]],
): [Choice, (choice: Choice) => void] {
  const choice = useSyncExternalStore(
    subscribe,
    () =>
      others.find((each) => each === localStorage.getItem(storageKey)) ??
      fallback,
    () => fallback,
  );

  return [
    choice,
    (next) => {
      localStorage.setItem(storageKey, next);
      listeners.forEach((listener) => listener());
    },
  ];
}

export type RoomView = 'list' | 'grid';

export function useRoomView(scope: string) {
  return useStoredChoice<RoomView>(`lender-room-view:${scope}`, [
    'list',
    'grid',
  ]);
}

export function useRoomSort(scope: string) {
  return useStoredChoice<RoomSort>(`lender-room-sort:${scope}`, [
    'name',
    'date',
    'type',
  ]);
}
