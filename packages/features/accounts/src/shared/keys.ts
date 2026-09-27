export const accountKeys = {
  data: (userId: string) => ['account:data', userId] as const,
};
