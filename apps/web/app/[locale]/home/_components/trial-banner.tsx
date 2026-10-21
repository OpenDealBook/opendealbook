import Link from 'next/link';

interface TrialBannerProps {
  isActive: boolean;
  endsAt: string | null;
  billingHref: string;
}

const DAY_MS = 1000 * 60 * 60 * 24;

export function daysLeft(endsAt: string): number {
  return Math.max(
    0,
    Math.ceil((new Date(endsAt).getTime() - Date.now()) / DAY_MS),
  );
}

export function TrialBanner({
  isActive,
  endsAt,
  billingHref,
}: TrialBannerProps) {
  if (!endsAt) {
    return null;
  }

  return (
    <div
      data-slot={'trial-banner'}
      className={
        'bg-muted flex items-center justify-between gap-4 border-b px-6 py-2 text-sm'
      }
    >
      {isActive ? (
        <span>{daysLeft(endsAt)} days left in your trial</span>
      ) : (
        <span className={'text-muted-foreground'}>
          Your trial has ended.{' '}
          <Link href={billingHref} className={'font-medium underline'}>
            Upgrade to keep working
          </Link>
        </span>
      )}
    </div>
  );
}
