import { IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from 'next/font/google';

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

export const fontVariables = `${fontSerif.variable} ${fontSans.variable} ${fontMono.variable}`;
