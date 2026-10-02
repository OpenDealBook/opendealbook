import type { ReactNode } from 'react';

import Link from 'next/link';

import { Button } from '@odb/ui/button';

const navLinks = [
  { href: '/customers', label: 'Customers' },
  { href: '/security', label: 'Security' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/blog', label: 'Blog' },
  { href: '/faq', label: 'FAQ' },
  { href: '/contact', label: 'Contact' },
];

const productLinks = [
  { href: '/solutions/corporate-development', label: 'Corporate development' },
  { href: '/self-hosting', label: 'Self-hosting' },
];

const legalLinks = [
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy' },
];

export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <div className={'flex min-h-screen flex-col'}>
      <header className={'border-b'}>
        <div
          className={
            'mx-auto flex w-full max-w-6xl items-center justify-between gap-6 px-6 py-4'
          }
        >
          <Link href={'/'} className={'text-lg font-semibold'}>
            Open Deal Book
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
          <span>© {new Date().getFullYear()} Open Deal Book</span>
          <div className={'flex flex-wrap gap-4'}>
            {productLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={'hover:text-foreground'}
              >
                {link.label}
              </Link>
            ))}
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
