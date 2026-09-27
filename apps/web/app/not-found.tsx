import Link from 'next/link';

export default function NotFound() {
  return (
    <main
      className={
        'flex min-h-screen flex-col items-center justify-center gap-4 p-8'
      }
    >
      <h1 className={'text-2xl font-semibold'}>Page not found</h1>
      <p className={'text-muted-foreground'}>
        The page you are looking for does not exist.
      </p>
      <Link className={'underline'} href={'/'}>
        Go home
      </Link>
    </main>
  );
}
