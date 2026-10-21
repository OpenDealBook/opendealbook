import { describe, expect, it } from 'vitest';

import { assembleSubmission } from './submission';

describe('assembleSubmission', () => {
  it('assembles a full buyer submission including the optional deal box and mfa', () => {
    const submission = assembleSubmission(
      { kind: 'buyer' },
      {
        profile: { name: 'Ada Lovelace', pictureUrl: undefined },
        workspace: { teamName: 'Acme' },
        terms: { acceptedTerms: true, compPoolOptin: true },
        dealBox: { criteria: { naics: ['541211'] } },
        mfa: { enroll: true },
      },
    );

    expect(submission).toEqual({
      kind: 'buyer',
      profile: { name: 'Ada Lovelace' },
      workspace: { teamName: 'Acme' },
      terms: { acceptedTerms: true, compPoolOptin: true },
      dealBox: { criteria: { naics: ['541211'] } },
      mfa: { enroll: true },
    });
  });

  it('omits the skippable steps when they were not provided', () => {
    const submission = assembleSubmission(
      { kind: 'buyer' },
      {
        profile: { name: 'Ada Lovelace', pictureUrl: undefined },
        workspace: { teamName: 'Acme' },
        terms: { acceptedTerms: true, compPoolOptin: false },
      },
    );

    expect(submission).not.toHaveProperty('dealBox');
    expect(submission).not.toHaveProperty('mfa');
  });

  it('assembles an invitee submission for the invited team with no comp-pool choice', () => {
    const submission = assembleSubmission(
      { kind: 'invitee', teamSlug: 'acme' },
      {
        profile: { name: 'Ada Lovelace', pictureUrl: undefined },
        terms: { acceptedTerms: true },
        mfa: { enroll: false },
      },
    );

    expect(submission).toEqual({
      kind: 'invitee',
      teamSlug: 'acme',
      profile: { name: 'Ada Lovelace' },
      terms: { acceptedTerms: true },
      mfa: { enroll: false },
    });
  });

  it('throws when a mandatory step is missing', () => {
    expect(() =>
      assembleSubmission(
        { kind: 'buyer' },
        {
          workspace: { teamName: 'Acme' },
          terms: { acceptedTerms: true, compPoolOptin: false },
        },
      ),
    ).toThrow();
    expect(() =>
      assembleSubmission(
        { kind: 'buyer' },
        {
          profile: { name: 'Ada Lovelace', pictureUrl: undefined },
          terms: { acceptedTerms: true, compPoolOptin: false },
        },
      ),
    ).toThrow();
  });
});
