'use client';

import { PageTitle } from '@odb/ui/page-header';

export default function LenderError() {
  return (
    <main className={'flex flex-col gap-3'}>
      <PageTitle>This page could not be loaded</PageTitle>
      <p>
        <a className={'inline-block py-1 underline'} href={''}>
          Reload the page
        </a>
      </p>
    </main>
  );
}
