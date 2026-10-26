import { describe, expect, it } from 'vitest';

import { stepLabel } from './nodeTypes';

describe('stepLabel', () => {
  it("uses the person's label, else the friendly type label", () => {
    expect(stepLabel({ id: 'a', type: 'ask_ai', label: 'Summarise', config: {} })).toBe('Summarise');
    expect(stepLabel({ id: 'a', type: 'ask_ai', config: {} })).toBe("Ask the team's AI");
  });
});
