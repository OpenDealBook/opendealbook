import * as React from 'react';

import { cn } from '#lib/utils';

export type ChatTypingIndicatorProps = React.ComponentProps<'div'>;

function ChatTypingIndicator({
  className,
  ...props
}: ChatTypingIndicatorProps) {
  return (
    <div
      data-slot="chat-typing-indicator"
      role="status"
      aria-label="Assistant is typing"
      className={cn(
        'bg-secondary flex w-fit items-center gap-1 rounded-lg px-3 py-2',
        className,
      )}
      {...props}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="bg-muted-foreground size-1.5 animate-bounce rounded-full"
          style={{ animationDelay: `${i * 160}ms` }}
        />
      ))}
    </div>
  );
}

export { ChatTypingIndicator };
