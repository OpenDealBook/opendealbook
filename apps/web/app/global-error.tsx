'use client';

import { PageTitle } from '@odb/ui/page-header';

import { fontVariables } from '~/app/fonts';
import '~/app/globals.css';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang={'en'}>
      <body className={fontVariables}>
        <main
          className={
            'flex min-h-screen flex-col items-center justify-center gap-4 p-8'
          }
        >
          <PageTitle>Something went wrong</PageTitle>
          <button
            type={'button'}
            className={'underline'}
            onClick={() => reset()}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
