import { describe, expect, it } from 'vitest';

import { toNotificationViewModel, type NotificationRow } from './types';

describe('toNotificationViewModel', () => {
  it('maps a notification row to a view model', () => {
    const row: NotificationRow = {
      id: 7,
      body: 'Order shipped',
      type: 'info',
      link: '/orders/7',
      created_at: '2026-09-26T10:00:00.000Z',
    };

    expect(toNotificationViewModel(row)).toEqual({
      id: 7,
      body: 'Order shipped',
      type: 'info',
      link: '/orders/7',
      createdAt: '2026-09-26T10:00:00.000Z',
    });
  });
});
