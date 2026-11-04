import Link from 'next/link';

import { PageTitle } from '@odb/ui/page-header';

export default function NotFound() {
  return (
    <main
      className={
        'flex min-h-screen flex-col items-center justify-center gap-4 p-8'
      }
    >
      <PageTitle>Page not found</PageTitle>
      <p className={'text-muted-foreground'}>
        The page you are looking for does not exist.
      </p>
      <Link className={'underline'} href={'/'}>
        Go home
      </Link>
    </main>
  );
}
