export const pathsConfig = {
  auth: {
    signIn: '/auth/sign-in',
    signUp: '/auth/sign-up',
    passwordReset: '/auth/password-reset',
    callback: '/auth/callback',
    updatePassword: '/update-password',
  },
  app: {
    home: '/home',
    billing: '/home/billing',
  },
} as const;

export default pathsConfig;
