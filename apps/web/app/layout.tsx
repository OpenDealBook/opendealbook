import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from 'next/font/google';

import { AnalyticsProvider } from '~/components/analytics-provider';
import { AnalyticsRouteTracker } from '~/components/analytics-route-tracker';
import { RootProviders } from '~/components/root-providers';
import appConfig from '~/config/app.config';
import '~/app/globals.css';

const fontSerif = Newsreader({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-serif',
});

const fontSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-sans',
});

const fontMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
});

const description =
  'The deal platform for teams that grow by acquisition. Run pipeline, diligence, the data room, contracts, and closing in one place, with counsel, sellers, and brokers each in the right lane.';

export const metadata: Metadata = {
  metadataBase: new URL(appConfig.url),
  title: {
    default: appConfig.name,
    template: `%s | ${appConfig.name}`,
  },
  description,
  openGraph: {
    type: 'website',
    siteName: appConfig.name,
    title: appConfig.name,
    description,
    url: appConfig.url,
  },
  twitter: {
    card: 'summary_large_image',
    title: appConfig.name,
    description,
  },
};

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={appConfig.locale} suppressHydrationWarning>
      <body
        className={`${fontSerif.variable} ${fontSans.variable} ${fontMono.variable}`}
      >
        <RootProviders>
          <AnalyticsProvider>
            <AnalyticsRouteTracker />
            {children}
          </AnalyticsProvider>
        </RootProviders>
      </body>
    </html>
  );
}
