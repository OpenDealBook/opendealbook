'use client';

import { useEffect } from 'react';

export function DetectTimezone() {
  useEffect(() => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const refused = `unsupported_timezone=${encodeURIComponent(timezone)}`;

    if (document.cookie.split('; ').includes(refused)) {
      return;
    }

    void fetch('/api/detected-timezone', {
      method: 'POST',
      body: JSON.stringify({ timezone }),
    });
  }, []);

  return null;
}
