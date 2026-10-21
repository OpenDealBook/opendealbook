import Link from 'next/link';

import { TEAM_READ_ONLY } from '@odb/next';
import { Button } from '@odb/ui/button';

interface BillingBannerProps {
  standing: 'past_due' | 'locked';
  canManageBilling: boolean;
  billingHref: string;
}

export function BillingBanner({
  standing,
  canManageBilling,
  billingHref,
}: BillingBannerProps) {
  return (
    <div
      data-slot={'billing-banner'}
      className={
        'bg-muted flex items-center justify-between gap-4 border-b px-6 py-2 text-sm'
      }
    >
      {standing === 'locked' ? (
        <span>
          {TEAM_READ_ONLY}
          {canManageBilling && (
            <>
              {' '}
              <Link href={billingHref} className={'font-medium underline'}>
                Go to billing
              </Link>
            </>
          )}
        </span>
      ) : (
        <>
          <span>Payment failed. Update billing to keep access.</span>

          {canManageBilling && (
            <Button asChild size={'sm'} variant={'outline'}>
              <Link href={billingHref}>Update payment</Link>
            </Button>
          )}
        </>
      )}
    </div>
  );
}
