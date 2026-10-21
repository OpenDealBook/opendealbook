import { cn } from '@odb/ui/utils';

const STAGES = ['Talking', 'LOI', 'Diligence', 'Closing', 'Closed'];

export function StageStrip({ current }: { current: string }) {
  const reached = STAGES.indexOf(current);

  return (
    <nav aria-label={'Where the sale stands'}>
      <ol className={'grid grid-cols-5 gap-1 text-center text-xs sm:text-sm'}>
        {STAGES.map((stage, index) => (
          <li
            key={stage}
            aria-current={index === reached ? 'step' : undefined}
            className={cn(
              'border-t-4 pt-2',
              index < reached && 'border-primary/40 text-muted-foreground',
              index === reached && 'border-primary font-semibold',
              index > reached && 'border-muted text-muted-foreground',
            )}
          >
            {stage}
          </li>
        ))}
      </ol>
    </nav>
  );
}
