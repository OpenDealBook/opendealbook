import { z } from 'zod';

const rangeSchema = z
  .object({
    min: z.number().nonnegative().nullable().default(null),
    max: z.number().nonnegative().nullable().default(null),
  })
  .refine(({ min, max }) => min === null || max === null || min <= max)
  .prefault({});

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
  size: z
    .object({
      jobs: rangeSchema,
      pppLoanAmount: rangeSchema,
      form5500Participants: rangeSchema,
      minBusinessAgeYears: z.number().nonnegative().nullable().default(null),
    })
    .prefault({}),
});

export type DealBoxCriteria = z.infer<typeof dealBoxCriteriaSchema>;
