'use client';

import * as React from 'react';

import { Avatar, AvatarFallback, AvatarImage } from '#components/avatar';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '#components/tooltip';
import { cn } from '#lib/utils';

export type MessageProps = {
  role?: 'user' | 'assistant';
  className?: string;
} & React.ComponentProps<'div'>;

const Message = ({ role = 'assistant', className, ...props }: MessageProps) => (
  <div
    data-slot="message"
    data-role={role}
    className={cn(
      'group flex gap-3',
      role === 'user' && 'flex-row-reverse',
      className,
    )}
    {...props}
  />
);

export type MessageAvatarProps = {
  src?: string;
  alt: string;
  fallback?: string;
  className?: string;
};

const MessageAvatar = ({
  src,
  alt,
  fallback,
  className,
}: MessageAvatarProps) => (
  <Avatar className={cn('size-8 shrink-0', className)}>
    {src ? <AvatarImage src={src} alt={alt} /> : null}
    {fallback ? <AvatarFallback>{fallback}</AvatarFallback> : null}
  </Avatar>
);

export type MessageContentProps = React.ComponentProps<'div'>;

const MessageContent = ({
  children,
  className,
  ...props
}: MessageContentProps) => (
  <div
    data-slot="message-content"
    className={cn(
      'bg-secondary text-secondary-foreground w-fit rounded-lg px-3 py-2 text-sm break-words whitespace-pre-wrap',
      'group-data-[role=user]:bg-primary group-data-[role=user]:text-primary-foreground',
      className,
    )}
    {...props}
  >
    {children}
  </div>
);

export type MessageActionsProps = React.ComponentProps<'div'>;

const MessageActions = ({
  children,
  className,
  ...props
}: MessageActionsProps) => (
  <div
    data-slot="message-actions"
    className={cn('text-muted-foreground flex items-center gap-2', className)}
    {...props}
  >
    {children}
  </div>
);

export type MessageActionProps = {
  className?: string;
  tooltip: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
} & React.ComponentProps<typeof Tooltip>;

const MessageAction = ({
  tooltip,
  children,
  className,
  side = 'top',
  ...props
}: MessageActionProps) => (
  <TooltipProvider>
    <Tooltip {...props}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} className={className}>
        {tooltip}
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

export { Message, MessageAvatar, MessageContent, MessageActions, MessageAction };
