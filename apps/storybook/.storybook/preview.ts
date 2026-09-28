import { withThemeByClassName } from '@storybook/addon-themes';
import type { Preview } from '@storybook/react-vite';

import '@odb/ui/globals.css';

// The token stylesheet drives both palettes off a `dark` class on <html>
// (its `@custom-variant dark (&:is(.dark *))`), so the toolbar toggle swaps
// that class rather than a data attribute.
const preview: Preview = {
  parameters: {
    backgrounds: { disable: true },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
  decorators: [
    withThemeByClassName({
      themes: {
        light: '',
        dark: 'dark',
      },
      defaultTheme: 'light',
    }),
  ],
};

export default preview;
