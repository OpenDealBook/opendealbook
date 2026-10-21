import { z } from 'zod';

const roomTarget = z.object({ roomId: z.uuid() });
const packageTarget = z.object({ dealId: z.uuid() });
const sellerRoomTarget = z.object({ sellerRoomId: z.uuid() });
const counselTarget = z.object({ counselDealId: z.uuid() });
const sellerCounselTarget = z.object({ sellerCounselDealId: z.uuid() });

export type SpaceTarget = z.infer<
  z.ZodUnion<
    [
      typeof roomTarget,
      typeof packageTarget,
      typeof sellerRoomTarget,
      typeof counselTarget,
      typeof sellerCounselTarget,
    ]
  >
>;

const TARGET_KEYS = [
  'roomId',
  'dealId',
  'sellerRoomId',
  'counselDealId',
  'sellerCounselDealId',
];

export function inRoomOrPackage<Shape extends z.ZodRawShape>(shape: Shape) {
  return z
    .unknown()
    .superRefine((raw, context) => {
      if (
        typeof raw === 'object' &&
        raw !== null &&
        TARGET_KEYS.filter((key) => key in raw).length > 1
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Add to a room or to the lender package, not both',
        });
      }
    })
    .pipe(
      z.union([
        roomTarget.extend(shape),
        packageTarget.extend(shape),
        sellerRoomTarget.extend(shape),
        counselTarget.extend(shape),
        sellerCounselTarget.extend(shape),
      ]),
    );
}
