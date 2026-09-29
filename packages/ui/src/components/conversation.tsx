'use client';

import * as React from 'react';

import { cn } from '#lib/utils';

export type ConversationProps = React.ComponentProps<'div'>;

function Conversation({ className, children, ...props }: ConversationProps) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [children]);

  return (
    <div
      ref={ref}
      data-slot="conversation"
      role="log"
      className={cn('flex-1 overflow-y-auto', className)}
      {...props}
    >
      {children}
    </div>
  );
}

export type ConversationContentProps = React.ComponentProps<'div'>;

function ConversationContent({
  className,
  ...props
}: ConversationContentProps) {
  return (
    <div
      data-slot="conversation-content"
      className={cn('flex flex-col gap-4 p-4', className)}
      {...props}
    />
  );
}

export { Conversation, ConversationContent };
