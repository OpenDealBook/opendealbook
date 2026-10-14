import { z } from 'zod';

const roomTarget = z.object({ roomId: z.uuid() });
const packageTarget = z.object({ dealId: z.uuid() });

export type SpaceTarget = z.infer<
  z.ZodUnion<[typeof roomTarget, typeof packageTarget]>
>;

export function inRoomOrPackage<Shape extends z.ZodRawShape>(shape: Shape) {
  return z
    .unknown()
    .superRefine((raw, context) => {
      if (
        typeof raw === 'object' &&
        raw !== null &&
        'roomId' in raw &&
        'dealId' in raw
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Add to a room or to the lender package, not both',
        });
      }
    })
    .pipe(z.union([roomTarget.extend(shape), packageTarget.extend(shape)]));
}
