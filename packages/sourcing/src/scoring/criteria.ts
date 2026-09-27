import { z } from 'zod';

export const dealBoxCriteriaSchema = z.object({
  weights: z
    .object({
      industry: z.number().nonnegative().default(0),
      revenue: z.number().nonnegative().default(0),
      geography: z.number().nonnegative().default(0),
      ownerAge: z.number().nonnegative().default(0),
      serviceMix: z.number().nonnegative().default(0),
    })
    .prefault({}),
  industries: z.array(z.string()).default([]),
  naics: z.array(z.string()).default([]),
  states: z.array(z.string()).default([]),
  cities: z.array(z.string()).default([]),
  employeeBands: z.array(z.string()).default([]),
  ownerRetirementAge: z.number().nullable().default(null),
  serviceMix: z.array(z.string()).default([]),
  exclusions: z
    .object({
      industries: z.array(z.string()).default([]),
      naics: z.array(z.string()).default([]),
      states: z.array(z.string()).default([]),
    })
    .prefault({}),
});

export type DealBoxCriteria = z.infer<typeof dealBoxCriteriaSchema>;
