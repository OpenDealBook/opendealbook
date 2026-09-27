import { getEnv } from '@tuckin/shared/env';

export const appConfig = {
  name: 'Tuckin',
  url: getEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000')!,
  locale: getEnv('NEXT_PUBLIC_DEFAULT_LOCALE', 'en')!,
  theme: 'system' as const,
} as const;

export default appConfig;
