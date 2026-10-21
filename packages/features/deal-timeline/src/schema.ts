import { z } from 'zod';

import type { Database } from '@odb/supabase';

export type MilestoneKind = Database['public']['Enums']['milestone_kind'];

export type FixedKind = Exclude<MilestoneKind, 'custom'>;

export const FIXED_KINDS = [
  'loi_deadline',
  'loi_signed',
  'diligence_end',
  'financing_contingency',
  'apa_signing',
  'closing',
  'effective',
] as const satisfies readonly FixedKind[];

export const FIXED_MILESTONES: Record<
  FixedKind,
  { label: string; startsShared: boolean }
> = {
  loi_deadline: { label: 'LOI deadline', startsShared: false },
  loi_signed: { label: 'LOI signed', startsShared: true },
  diligence_end: { label: 'Diligence end', startsShared: false },
  financing_contingency: {
    label: 'Financing contingency',
    startsShared: false,
  },
  apa_signing: { label: 'APA signing', startsShared: true },
  closing: { label: 'Closing', startsShared: true },
  effective: { label: 'Effective date', startsShared: true },
};

const milestoneValues = {
  dealId: z.uuid(),
  milestoneId: z.uuid(),
  targetOn: z.iso.date().nullable(),
  actualOn: z.iso.date().nullable(),
  shared: z.boolean(),
};

export const setMilestoneSchema = z.discriminatedUnion('kind', [
  z.object({ ...milestoneValues, kind: z.enum(FIXED_KINDS) }),
  z.object({
    ...milestoneValues,
    kind: z.literal('custom'),
    label: z.string().trim().min(1, 'Name the milestone first.'),
  }),
]);

export type SetMilestoneInput = z.input<typeof setMilestoneSchema>;

export const removeMilestoneSchema = z.object({
  dealId: z.uuid(),
  milestoneId: z.uuid(),
});
