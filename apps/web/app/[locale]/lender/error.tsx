'use client';

export default function LenderError() {
  return (
    <main className={'flex flex-col gap-3'}>
      <h1 className={'text-2xl font-semibold'}>
        This page could not be loaded
      </h1>
      <p>
        <a className={'inline-block py-1 underline'} href={''}>
          Reload the page
        </a>
      </p>
    </main>
  );
}
