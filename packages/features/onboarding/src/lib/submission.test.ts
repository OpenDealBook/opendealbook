import { describe, expect, it } from 'vitest';

import { assembleSubmission } from './submission';

describe('assembleSubmission', () => {
  it('assembles a full submission including the optional deal box and mfa', () => {
    const submission = assembleSubmission({
      profile: { name: 'Ada Lovelace', pictureUrl: undefined },
      workspace: { kind: 'team', teamName: 'Acme' },
      terms: { acceptedTerms: true, compPoolOptin: true },
      dealBox: { criteria: { naics: ['541211'] } },
      mfa: { enroll: true },
    });

    expect(submission).toEqual({
      profile: { name: 'Ada Lovelace' },
      workspace: { kind: 'team', teamName: 'Acme' },
      terms: { acceptedTerms: true, compPoolOptin: true },
      dealBox: { criteria: { naics: ['541211'] } },
      mfa: { enroll: true },
    });
  });

  it('omits the skippable steps when they were not provided', () => {
    const submission = assembleSubmission({
      profile: { name: 'Ada Lovelace', pictureUrl: undefined },
      workspace: { kind: 'personal' },
      terms: { acceptedTerms: true, compPoolOptin: false },
    });

    expect(submission.dealBox).toBeUndefined();
    expect(submission.mfa).toBeUndefined();
    expect(submission.workspace).toEqual({ kind: 'personal' });
  });

  it('throws when a mandatory step is missing', () => {
    expect(() =>
      assembleSubmission({
        workspace: { kind: 'personal' },
        terms: { acceptedTerms: true, compPoolOptin: false },
      }),
    ).toThrow();
  });
});
