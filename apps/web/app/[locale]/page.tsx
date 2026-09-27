import Link from 'next/link';

import { getTranslations } from 'next-intl/server';

import { Button } from '@tuckin/ui/button';

import pathsConfig from '~/config/paths.config';

export default async function LandingPage() {
  const t = await getTranslations('marketing');

  return (
    <main
      className={
        'flex min-h-screen flex-col items-center justify-center gap-6 p-8'
      }
    >
      <h1 className={'text-4xl font-bold'}>{t('heroTitle')}</h1>
      <p className={'text-muted-foreground'}>{t('heroSubtitle')}</p>

      <div className={'flex gap-3'}>
        <Button asChild>
          <Link href={pathsConfig.auth.signIn}>Sign in</Link>
        </Button>
        <Button asChild variant={'outline'}>
          <Link href={pathsConfig.auth.signUp}>Sign up</Link>
        </Button>
      </div>
    </main>
  );
}
