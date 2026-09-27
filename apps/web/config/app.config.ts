export const appConfig = {
  name: 'Open Deal Book',
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://opendealbook.com',
  locale: process.env.NEXT_PUBLIC_DEFAULT_LOCALE ?? 'en',
  theme: 'system' as const,
} as const;

export default appConfig;
