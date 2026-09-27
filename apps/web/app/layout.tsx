import type { ReactNode } from 'react';

import { AnalyticsProvider } from '~/components/analytics-provider';
import { RootProviders } from '~/components/root-providers';
import appConfig from '~/config/app.config';

import '~/app/globals.css';

export const metadata = {
  title: appConfig.name,
  description: 'Track, manage, and close every deal in one place.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={appConfig.locale} suppressHydrationWarning>
      <body>
        <RootProviders>
          <AnalyticsProvider>{children}</AnalyticsProvider>
        </RootProviders>
      </body>
    </html>
  );
}
