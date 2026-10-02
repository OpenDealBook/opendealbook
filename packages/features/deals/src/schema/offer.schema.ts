import { fundingSourceSchema } from '@odb/calculators';
import { z } from 'zod';

export const OFFER_TERMS_SCHEMA_VERSION = 1;

export const inventoryTreatmentSchema = z.enum([
  'included',
  'at_cost',
  'at_agreed_value',
  'excluded',
]);

export const workingCapitalMechanismSchema = z.enum(['peg', 'collar', 'none']);

export const escrowHoldbackBasisSchema = z.enum(['pct', 'amount']);

export const contingencyTypeSchema = z.enum([
  'financing',
  'due_diligence',
  'landlord_approval',
  'lease_assignment',
  'license_transfer',
  'key_employee_retention',
  'franchisor_approval',
  'other',
]);

export const sellerAgreementKindSchema = z.enum([
  'none',
  'employment',
  'consulting',
]);

export const offerAuthorSideSchema = z.enum(['buyer', 'seller']);

export const offerContingencySchema = z.object({
  type: contingencyTypeSchema,
  note: z.string().optional(),
});

export const offerTermsSchema = z.object({
  schema_version: z.literal(OFFER_TERMS_SCHEMA_VERSION).default(
    OFFER_TERMS_SCHEMA_VERSION,
  ),

  purchase_price: z.number().positive(),
  real_estate_portion: z.number().optional(),
  inventory_treatment: inventoryTreatmentSchema.optional(),
  inventory_cap: z.number().optional(),
  valuation_basis: z.string().optional(),

  cash_at_close: z.number().optional(),
  earnout: z
    .object({
      amount: z.number(),
      months: z.number().int(),
      metric: z.string(),
      targets: z.array(z.number()),
      note: z.string().optional(),
    })
    .optional(),
  ar_included: z.boolean().optional(),
  ap_assumed: z.boolean().optional(),
  working_capital_peg: z.number().optional(),
  working_capital_mechanism: workingCapitalMechanismSchema.optional(),

  funding_sources: z.array(fundingSourceSchema).optional(),
  seller_note: z
    .object({
      amount: z.number(),
      rate: z.number(),
      term_years: z.number(),
      standby_months: z.number(),
      note: z.string().optional(),
    })
    .optional(),

  earnest_deposit: z
    .object({
      amount: z.number(),
      due_days: z.number().int(),
      note: z.string().optional(),
    })
    .optional(),
  escrow_holdback: z
    .object({
      basis: escrowHoldbackBasisSchema,
      value: z.number(),
      months: z.number().int(),
      note: z.string().optional(),
    })
    .optional(),

  exclusivity_days: z.number().int().optional(),
  diligence_days: z.number().int().optional(),
  target_close_date: z.iso.date().optional(),
  offer_expires_at: z.iso.datetime().optional(),

  contingencies: z.array(offerContingencySchema).optional(),

  non_compete: z
    .object({
      years: z.number(),
      radius: z.string(),
      scope: z.string(),
      note: z.string().optional(),
    })
    .optional(),
  training_period: z
    .object({
      length: z.string(),
      paid: z.boolean(),
      note: z.string().optional(),
    })
    .optional(),
  seller_agreement: z
    .object({
      kind: sellerAgreementKindSchema,
      months: z.number().int().optional(),
      pay: z.number().optional(),
      note: z.string().optional(),
    })
    .optional(),

  key_employees: z.array(z.string()).optional(),
  confidentiality: z.string().optional(),
  other_terms: z.string().optional(),
});

export const offerVersionSchema = z.object({
  number: z.number().int(),
  author_side: offerAuthorSideSchema,
  purchase_price: z.number().positive(),
  real_estate_portion: z.number().optional(),
  target_close_date: z.iso.date().optional(),
  offer_expires_at: z.iso.datetime().optional(),
  exclusivity_days: z.number().int().optional(),
  diligence_days: z.number().int().optional(),
  terms: offerTermsSchema,
  calc_version_id: z.uuid().optional(),
  approved_by: z.uuid().optional(),
  approved_at: z.iso.datetime().optional(),
});

export const offerIdSchema = z.object({
  offer_id: z.uuid(),
});

export const createOfferSchema = z.object({
  deal_id: z.uuid(),
  first_version: offerVersionSchema,
});

export const addOfferVersionSchema = z.object({
  offer_id: z.uuid(),
  author_side: offerAuthorSideSchema,
  version: offerVersionSchema,
});

export type OfferIdPayload = z.infer<typeof offerIdSchema>;
export type CreateOfferPayload = z.infer<typeof createOfferSchema>;
export type AddOfferVersionPayload = z.infer<typeof addOfferVersionSchema>;

export type InventoryTreatment = z.infer<typeof inventoryTreatmentSchema>;
export type WorkingCapitalMechanism = z.infer<
  typeof workingCapitalMechanismSchema
>;
export type ContingencyType = z.infer<typeof contingencyTypeSchema>;
export type SellerAgreementKind = z.infer<typeof sellerAgreementKindSchema>;
export type OfferAuthorSide = z.infer<typeof offerAuthorSideSchema>;
export type OfferContingency = z.infer<typeof offerContingencySchema>;
export type OfferTerms = z.infer<typeof offerTermsSchema>;
export type OfferVersion = z.infer<typeof offerVersionSchema>;

export interface OfferTermDiff {
  path: string;
  before: unknown;
  after: unknown;
}

const isTermObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const collectDiffs = (
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  prefix: string,
): OfferTermDiff[] => {
  const keys = [
    ...new Set([...Object.keys(before), ...Object.keys(after)]),
  ].sort();

  return keys.flatMap((key) => {
    const path = prefix ? `${prefix}.${key}` : key;
    const a = before[key];
    const b = after[key];

    if (isTermObject(a) && isTermObject(b)) {
      return collectDiffs(a, b, path);
    }

    if (JSON.stringify(a) === JSON.stringify(b)) {
      return [];
    }

    return [{ path, before: a, after: b }];
  });
};

export const diffOfferTerms = (a: OfferTerms, b: OfferTerms): OfferTermDiff[] =>
  collectDiffs(
    a as Record<string, unknown>,
    b as Record<string, unknown>,
    '',
  );
