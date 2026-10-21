// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { NotificationViewModel } from '../types';
import { NotificationsBell } from './notifications-bell';

const unread: NotificationViewModel = {
  id: 1,
  body: 'Owen Castillo uploaded the lease',
  type: 'info',
  link: '/home/acme/deals/d1',
  createdAt: '2026-10-19T10:00:00.000Z',
  read: false,
  dealName: 'Brennan Climate',
};

const read: NotificationViewModel = {
  ...unread,
  id: 2,
  body: 'A new member joined Acme',
  createdAt: '2026-10-16T12:00:00.000Z',
  read: true,
  dealName: null,
};

describe('NotificationsBell', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-19T12:00:00.000Z'));
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function render(
    notifications: NotificationViewModel[],
    handlers: Partial<{
      onDismiss: (id: number) => void;
      onMarkAllRead: () => void;
    }> = {},
  ) {
    act(() =>
      root.render(
        <NotificationsBell
          notifications={notifications}
          onDismiss={handlers.onDismiss ?? (() => undefined)}
          onMarkAllRead={handlers.onMarkAllRead ?? (() => undefined)}
        />,
      ),
    );
  }

  function bell() {
    return container.querySelector('button')!;
  }

  function open() {
    act(() => {
      bell().focus();
      bell().dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      );
    });
  }

  function menu() {
    return document.body.querySelector('[role="menu"]')!;
  }

  function button(name: string) {
    return [...menu().querySelectorAll('button, [role="menuitem"]')].find(
      (node) =>
        (node.getAttribute('aria-label') ?? node.textContent) === name,
    ) as HTMLElement;
  }

  it('names the bell and counts only unread notifications', () => {
    render([unread, read]);

    expect(bell().getAttribute('aria-label')).toBe('Notifications, 1 unread');
    expect(bell().textContent).toBe('1');
  });

  it('names the bell without a count when everything is read', () => {
    render([read]);

    expect(bell().getAttribute('aria-label')).toBe('Notifications');
    expect(bell().textContent).toBe('');
  });

  it('lists each notification with its deal and age', () => {
    render([unread, read]);
    open();

    const items = [...menu().querySelectorAll('li')].map(
      (item) => item.textContent,
    );

    expect(items).toEqual([
      expect.stringContaining('Owen Castillo uploaded the lease'),
      expect.stringContaining('A new member joined Acme'),
    ]);
    expect(items[0]).toContain('Brennan Climate');
    expect(items[0]).toContain('2h ago');
    expect(items[1]).toContain('3d ago');
  });

  it('says so when there are no notifications', () => {
    render([]);
    open();

    expect(menu().textContent).toContain('No notifications yet');
  });

  it('offers no mark all read when there are no notifications', () => {
    render([]);
    open();

    expect(button('Mark all read')).toBeUndefined();
  });

  it('marks all read from the list', () => {
    const onMarkAllRead = vi.fn();
    render([unread], { onMarkAllRead });
    open();

    act(() => button('Mark all read').click());

    expect(onMarkAllRead).toHaveBeenCalled();
  });

  it('dismisses one notification', () => {
    const onDismiss = vi.fn();
    render([unread], { onDismiss });
    open();

    act(() => button('Dismiss').click());

    expect(onDismiss).toHaveBeenCalledWith(1);
  });
});
