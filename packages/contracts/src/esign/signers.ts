import { z } from 'zod';

export const signersSchema = z
  .array(
    z.object({
      name: z.string().trim().min(1, 'Each signer needs a name'),
      email: z.email('Each signer needs a valid email address'),
    }),
  )
  .min(1, 'Name at least one signer');

export type Signer = z.infer<typeof signersSchema>[number];
