import { describe, expect, it } from 'vitest';

import { industryChoiceFor } from './industry-choice';

const industries = [
  { id: 'hvac-id', name: 'HVAC' },
  { id: 'dental-id', name: 'Dental' },
];

describe('industryChoiceFor', () => {
  it('picks the listed industry the extracted one names, ignoring case and spaces', () => {
    expect(industryChoiceFor(industries, ' hvac ')).toEqual({ industry_id: 'hvac-id' });
  });

  it('falls back to Other with the extracted text when no listed industry matches', () => {
    expect(industryChoiceFor(industries, 'HVAC services')).toEqual({
      industry: 'HVAC services',
    });
  });

  it('leaves the picker empty when nothing was extracted', () => {
    expect(industryChoiceFor(industries, null)).toEqual({});
  });
});
