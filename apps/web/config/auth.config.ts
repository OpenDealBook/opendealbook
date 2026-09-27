import type { Provider } from '@supabase/supabase-js';

export const authConfig = {
  providers: {
    password: true,
    magicLink: false,
    oAuth: [] as Provider[],
  },
} as const;

export default authConfig;
