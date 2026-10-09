import * as React from 'react';

import { cn } from '#lib/utils';

const WORDMARK = 'OPEN DEAL BOOK';

function LogoMark({
  gradientId,
  mono,
  className,
  style,
}: {
  gradientId: string;
  mono?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 240 196"
      fill="none"
      role="img"
      aria-label="Open Deal Book"
      className={className}
      style={style}
    >
      {!mono && (
        <defs>
          <linearGradient
            id={gradientId}
            gradientUnits="userSpaceOnUse"
            x1="16"
            y1="150"
            x2="224"
            y2="64"
          >
            <stop offset="0" stopColor="#122A47" />
            <stop offset="0.52" stopColor="#167C52" />
            <stop offset="1" stopColor="#3ECD5E" />
          </linearGradient>
        </defs>
      )}
      <g
        fill="none"
        stroke={mono ? 'currentColor' : `url(#${gradientId})`}
        strokeWidth="12"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M 29.54 17.85 L 19.08 17.85 L 18.46 46.15 L 23.38 139.08 C 30.77 154.46 46.77 172.31 75.69 180.31 C 101.54 185.84 109.54 188.31 114.46 189.54 C 119.38 188.31 127.38 185.84 153.23 180.31 C 182.15 172.31 198.15 154.46 205.54 139.08 L 210.46 46.15 L 209.84 21.54" />
        <path d="M 108.92 46.15 C 110.77 80.0 112.61 123.08 114.46 171.08 C 92.31 160.0 65.85 153.23 46.15 139.08 C 40.62 135.38 38.46 129.85 38.15 122.46 L 37.54 28.31 C 37.54 18.46 40.62 13.54 48.62 12.92 C 72.61 12.31 92.31 28.92 108.92 46.15 Z" />
        <path d="M 120.0 46.15 C 118.15 80.0 116.31 123.08 114.46 171.08 C 136.61 160.0 163.08 153.23 182.77 139.08 C 188.31 135.38 190.46 129.85 190.77 122.46 L 191.38 28.31 C 191.38 18.46 188.31 13.54 180.31 12.92 C 156.31 12.31 136.61 28.92 120.0 46.15 Z" />
        <path d="M 229.23 20.31 L 229.23 70.77" />
      </g>
    </svg>
  );
}

function Logo({
  size = 24,
  wordmark = false,
  mono = false,
  className,
}: {
  size?: number;
  wordmark?: boolean;
  mono?: boolean;
  className?: string;
}) {
  const gradientId = React.useId();

  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark
        gradientId={gradientId}
        mono={mono}
        className="shrink-0"
        style={{ width: size, height: (size * 196) / 240 }}
      />
      {wordmark && (
        <span className="text-foreground text-lg font-semibold tracking-tight">
          {WORDMARK}
        </span>
      )}
    </span>
  );
}

export { Logo };
