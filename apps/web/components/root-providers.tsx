'use client';

import { useState, type ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';

export function RootProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute={'class'}
        defaultTheme={'system'}
        enableSystem
      >
        {children}
      </ThemeProvider>
    </QueryClientProvider>
  );
}
