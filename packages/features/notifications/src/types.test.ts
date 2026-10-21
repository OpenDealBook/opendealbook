import { describe, expect, it } from 'vitest';

import {
  notificationAge,
  toNotificationViewModel,
  type NotificationRow,
} from './types';

const row: NotificationRow = {
  id: 7,
  body: 'Order shipped',
  type: 'info',
  link: '/orders/7',
  created_at: '2026-09-26T10:00:00.000Z',
  deal: null,
  notification_reads: [],
};

describe('toNotificationViewModel', () => {
  it('maps an unread notification with no deal to a view model', () => {
    expect(toNotificationViewModel(row)).toEqual({
      id: 7,
      body: 'Order shipped',
      type: 'info',
      link: '/orders/7',
      createdAt: '2026-09-26T10:00:00.000Z',
      read: false,
      dealName: null,
    });
  });

  it('is read once the viewer has a read for it', () => {
    expect(
      toNotificationViewModel({
        ...row,
        notification_reads: [{ read_at: '2026-09-26T11:00:00.000Z' }],
      }).read,
    ).toBe(true);
  });

  it('names the deal by its business name', () => {
    expect(
      toNotificationViewModel({
        ...row,
        deal: { firm: { name: 'Brennan Climate' } },
      }).dealName,
    ).toBe('Brennan Climate');
  });
});

describe('notificationAge', () => {
  const now = new Date('2026-09-26T12:00:00.000Z');

  it.each([
    ['2026-09-26T11:59:40.000Z', 'just now'],
    ['2026-09-26T11:55:00.000Z', '5m ago'],
    ['2026-09-26T10:00:00.000Z', '2h ago'],
    ['2026-09-23T12:00:00.000Z', '3d ago'],
  ])('describes %s as %s', (createdAt, age) => {
    expect(notificationAge(createdAt, now)).toBe(age);
  });
});
