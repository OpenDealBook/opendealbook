'use client';

import { useEffect, useState } from 'react';

import { usePathname } from 'next/navigation';

import { isItemAnchor } from '@odb/notifications/relay';
import { Alert, AlertDescription } from '@odb/ui/alert';

const HIGHLIGHT = 'bg-accent';
const HIGHLIGHT_MS = 2000;

export function ItemFocus() {
  const pathname = usePathname();
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    const anchor = window.location.hash.slice(1);
    const item = isItemAnchor(anchor)
      ? document.getElementById(anchor)
      : undefined;
    setMissing(item === null);

    if (item) {
      for (
        let closed = item.closest('details:not([open])');
        closed;
        closed = closed.closest('details:not([open])')
      ) {
        closed.setAttribute('open', '');
      }
      for (const closed of item.querySelectorAll('details:not([open])')) {
        closed.setAttribute('open', '');
      }
      item.scrollIntoView({ block: 'center' });
      item.classList.add(HIGHLIGHT);
      setTimeout(() => item.classList.remove(HIGHLIGHT), HIGHLIGHT_MS);
    }
  }, [pathname]);

  return missing ? (
    <Alert>
      <AlertDescription>That item is no longer available.</AlertDescription>
    </Alert>
  ) : null;
}
