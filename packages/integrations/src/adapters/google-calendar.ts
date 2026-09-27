import { createProxy } from './base';
import type { AdapterConfig, CalendarAdapter, CalendarEvent } from './types';

export function createGoogleCalendarAdapter(
  config: AdapterConfig,
): CalendarAdapter {
  const proxy = createProxy(config);

  return {
    provider: 'google-calendar',
    proxy,
    listEvents: (params) =>
      proxy({ endpoint: '/calendar/v3/calendars/primary/events', params }),
    createEvent: (event: CalendarEvent) =>
      proxy({
        method: 'POST',
        endpoint: '/calendar/v3/calendars/primary/events',
        data: event,
      }),
  };
}
