import type { MetadataRoute } from 'next';

import appConfig from '~/config/app.config';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: appConfig.name,
    short_name: appConfig.name,
    description: 'The deal platform for teams that grow by acquisition.',
    start_url: '/',
    display: 'standalone',
    background_color: '#F4EFE4',
    theme_color: '#141A17',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
