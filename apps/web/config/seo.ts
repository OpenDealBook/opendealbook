import type { Metadata } from 'next';

import appConfig from './app.config';

export const ogImageMetadata = {
  openGraph: {
    images: [
      { url: '/og-image.png', width: 1200, height: 630, alt: appConfig.name },
    ],
  },
  twitter: {
    card: 'summary_large_image' as const,
    images: ['/og-image.png'],
  },
};

export function pageMetadata(input: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  const { title, description, path } = input;

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: 'website',
      siteName: appConfig.name,
      title,
      description,
      url: path,
      ...ogImageMetadata.openGraph,
    },
    twitter: {
      title,
      description,
      ...ogImageMetadata.twitter,
    },
  };
}
