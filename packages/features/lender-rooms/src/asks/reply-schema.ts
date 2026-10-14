import { z } from 'zod';

const messageOrFile = z
  .object({
    body: z.string().trim().optional(),
    documentIds: z.array(z.uuid()).optional(),
  })
  .refine(
    (reply) => Boolean(reply.body || reply.documentIds?.length),
    'A reply needs a message or a file',
  );

export function replySchemaFor<IdKey extends string>(idKey: IdKey) {
  return z
    .object({ [idKey]: z.uuid() } as Record<IdKey, z.ZodUUID>)
    .and(messageOrFile);
}
