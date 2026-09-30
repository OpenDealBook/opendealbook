import type { Metadata } from 'next';

import appConfig from './app.config';

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
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}
