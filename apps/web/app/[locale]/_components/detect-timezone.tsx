'use client';

import { useEffect } from 'react';

import { rememberDetectedTimezoneAction } from '@odb/accounts/server/personal-account-actions';

export function DetectTimezone() {
  useEffect(() => {
    void rememberDetectedTimezoneAction({
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  }, []);

  return null;
}
