import { getTranslations } from 'next-intl/server';

import { Alert, AlertDescription, AlertTitle } from '@odb/ui/alert';
import { Button } from '@odb/ui/button';

import { unsubscribe } from './actions';

export default async function UnsubscribePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string; status?: string }>;
}) {
  const { locale } = await params;
  const { token, status } = await searchParams;
  const t = await getTranslations({ locale, namespace: 'common.unsubscribe' });

  return (
    <main className={'flex min-h-screen items-center justify-center p-8'}>
      <Alert className={'w-full max-w-sm'}>
        {status === 'done' ? (
          <>
            <AlertTitle>{t('done')}</AlertTitle>
            <AlertDescription>{t('doneDetail')}</AlertDescription>
          </>
        ) : status === 'invalid' || token === undefined ? (
          <AlertTitle>{t('invalid')}</AlertTitle>
        ) : (
          <>
            <AlertTitle>{t('prompt')}</AlertTitle>
            <AlertDescription>
              <form action={unsubscribe.bind(null, token)}>
                <Button type={'submit'}>{t('button')}</Button>
              </form>
            </AlertDescription>
          </>
        )}
      </Alert>
    </main>
  );
}
