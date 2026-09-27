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
        scriptProps={{
          type:
            typeof window === 'undefined' ? 'text/javascript' : 'text/plain',
        }}
      >
        {children}
      </ThemeProvider>
    </QueryClientProvider>
  );
}
