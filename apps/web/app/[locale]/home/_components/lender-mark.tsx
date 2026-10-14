import { cn } from '@odb/ui/utils';

export function LenderLogo({
  name,
  logoUrl,
  className,
}: {
  name: string;
  logoUrl: string;
  className?: string;
}) {
  return (
    <img
      src={logoUrl}
      alt={`${name} logo`}
      className={cn(
        'bg-card size-11 shrink-0 rounded-lg border object-contain p-1',
        className,
      )}
    />
  );
}

export function LenderMark({
  name,
  initials,
  logoUrl,
  className,
}: {
  name: string;
  initials: string;
  logoUrl: string | null;
  className?: string;
}) {
  return logoUrl ? (
    <LenderLogo name={name} logoUrl={logoUrl} className={className} />
  ) : (
    <span
      aria-hidden
      className={cn(
        'bg-primary text-primary-foreground flex size-11 shrink-0 items-center justify-center rounded-lg font-serif text-base',
        className,
      )}
    >
      {initials}
    </span>
  );
}
