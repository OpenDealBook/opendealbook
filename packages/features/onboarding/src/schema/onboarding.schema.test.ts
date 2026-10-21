import { describe, expect, it } from 'vitest';

import {
  dealBoxCriteriaSchema,
  inviteeTermsStepSchema,
  profileStepSchema,
  termsStepSchema,
  workspaceStepSchema,
} from './onboarding.schema';

describe('profileStepSchema', () => {
  it('requires a name of at least two characters', () => {
    expect(profileStepSchema.safeParse({ name: 'A' }).success).toBe(false);
    expect(profileStepSchema.safeParse({ name: 'Ada Lovelace' }).success).toBe(
      true,
    );
  });
});

describe('workspaceStepSchema', () => {
  it('has no personal option and requires a team name', () => {
    expect(workspaceStepSchema.safeParse({ kind: 'personal' }).success).toBe(
      false,
    );
    expect(workspaceStepSchema.safeParse({}).success).toBe(false);
    expect(workspaceStepSchema.safeParse({ teamName: 'Acme' }).data).toEqual({
      teamName: 'Acme',
    });
  });
});

describe('termsStepSchema', () => {
  it('rejects submission until the hosted terms are accepted', () => {
    expect(
      termsStepSchema.safeParse({ acceptedTerms: false, compPoolOptin: true })
        .success,
    ).toBe(false);
  });

  it('accepts either comparables opt-in choice once terms are accepted', () => {
    expect(
      termsStepSchema.safeParse({ acceptedTerms: true, compPoolOptin: false })
        .success,
    ).toBe(true);
    expect(
      termsStepSchema.safeParse({ acceptedTerms: true, compPoolOptin: true })
        .success,
    ).toBe(true);
  });
});

describe('inviteeTermsStepSchema', () => {
  it('requires accepted terms and carries no comp-pool choice', () => {
    expect(
      inviteeTermsStepSchema.safeParse({ acceptedTerms: false }).success,
    ).toBe(false);
    expect(
      inviteeTermsStepSchema.parse({
        acceptedTerms: true,
        compPoolOptin: true,
      }),
    ).toEqual({ acceptedTerms: true });
  });
});

describe('dealBoxCriteriaSchema', () => {
  it('treats target NAICS and every criterion as optional', () => {
    expect(dealBoxCriteriaSchema.safeParse({}).success).toBe(true);
    expect(dealBoxCriteriaSchema.safeParse({ naics: ['541211'] }).success).toBe(
      true,
    );
  });
});
