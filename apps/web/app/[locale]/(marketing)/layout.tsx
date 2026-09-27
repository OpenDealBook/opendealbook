import Link from 'next/link';

import { Button } from '@tuckin/ui/button';

const navLinks = [
  { href: '/pricing', label: 'Pricing' },
  { href: '/blog', label: 'Blog' },
  { href: '/faq', label: 'FAQ' },
  { href: '/contact', label: 'Contact' },
];

const legalLinks = [
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy' },
];

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={'flex min-h-screen flex-col'}>
      <header className={'border-b'}>
        <div
          className={
            'mx-auto flex w-full max-w-6xl items-center justify-between gap-6 px-6 py-4'
          }
        >
          <Link href={'/'} className={'text-lg font-semibold'}>
            Tuckin
          </Link>

          <nav className={'flex items-center gap-6 text-sm'}>
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={'text-muted-foreground hover:text-foreground'}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <Button asChild variant={'outline'}>
            <Link href={'/auth/sign-in'}>Sign in</Link>
          </Button>
        </div>
      </header>

      <main className={'flex-1'}>{children}</main>

      <footer className={'border-t'}>
        <div
          className={
            'text-muted-foreground mx-auto flex w-full max-w-6xl flex-col gap-2 px-6 py-6 text-sm sm:flex-row sm:items-center sm:justify-between'
          }
        >
          <span>© {new Date().getFullYear()} Tuckin</span>
          <div className={'flex gap-4'}>
            {legalLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={'hover:text-foreground'}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
