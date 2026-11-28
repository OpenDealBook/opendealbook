import localFont from 'next/font/local';

const fontSerif = localFont({
  src: [
    {
      path: './fonts/newsreader-latin-400-normal.woff2',
      weight: '400',
    },
    {
      path: './fonts/newsreader-latin-500-normal.woff2',
      weight: '500',
    },
  ],
  adjustFontFallback: 'Times New Roman',
  variable: '--font-serif',
});

const fontSans = localFont({
  src: [
    {
      path: './fonts/ibm-plex-sans-latin-400-normal.woff2',
      weight: '400',
    },
    {
      path: './fonts/ibm-plex-sans-latin-500-normal.woff2',
      weight: '500',
    },
    {
      path: './fonts/ibm-plex-sans-latin-600-normal.woff2',
      weight: '600',
    },
  ],
  variable: '--font-sans',
});

const fontMono = localFont({
  src: [
    {
      path: './fonts/ibm-plex-mono-latin-400-normal.woff2',
      weight: '400',
    },
    {
      path: './fonts/ibm-plex-mono-latin-500-normal.woff2',
      weight: '500',
    },
  ],
  variable: '--font-mono',
});

export const fontVariables = `${fontSerif.variable} ${fontSans.variable} ${fontMono.variable}`;
