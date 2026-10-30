import { describe, expect, it } from 'vitest';

import { templateTypeSchema } from './types';

describe('templateTypeSchema', () => {
  it('accepts an LOI extension template', () => {
    expect(templateTypeSchema.parse('loi_extension')).toBe('loi_extension');
  });
});
