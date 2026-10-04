import { createProxy } from './base';
import type { AdapterConfig, CalendarAdapter, CalendarEvent } from './types';

export function createOutlookCalendarAdapter(
  config: AdapterConfig,
): CalendarAdapter {
  const proxy = createProxy(config);

  return {
    provider: 'outlook-calendar',
    proxy,
    listEvents: (params) => proxy({ endpoint: '/v1.0/me/events', params }),
    createEvent: (event: CalendarEvent) =>
      proxy({
        method: 'POST',
        endpoint: '/v1.0/me/events',
        data: {
          subject: event.title,
          start: { dateTime: event.start, timeZone: 'UTC' },
          end: { dateTime: event.end, timeZone: 'UTC' },
        },
      }),
  };
}
