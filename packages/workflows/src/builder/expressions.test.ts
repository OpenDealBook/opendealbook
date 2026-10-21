import { describe, expect, it } from 'vitest';

import { resolveExpressions } from './expressions';

const steps = {
  trigger: {},
  lookup: { firm: 'Acme Partners', deal: { stage: 'loi', size: 3 } },
};

describe('resolveExpressions', () => {
  it('replaces a whole-value reference with the referenced value, keeping its type', () => {
    expect(
      resolveExpressions({ size: '{{steps.lookup.deal.size}}' }, steps),
    ).toEqual({ size: 3 });
  });

  it('interpolates references inside text', () => {
    expect(
      resolveExpressions(
        { message: 'Review {{ steps.lookup.firm }} at {{steps.lookup.deal.stage}}' },
        steps,
      ),
    ).toEqual({ message: 'Review Acme Partners at loi' });
  });

  it('resolves references nested in arrays and objects and leaves plain values alone', () => {
    expect(
      resolveExpressions(
        { to: ['{{steps.lookup.firm}}', 'ops'], options: { urgent: true } },
        steps,
      ),
    ).toEqual({ to: ['Acme Partners', 'ops'], options: { urgent: true } });
  });

  it('refuses a reference to a step that has not run on this path', () => {
    expect(() =>
      resolveExpressions({ message: '{{steps.later.firm}}' }, steps),
    ).toThrow('steps.later.firm');
  });

  it('refuses a reference to a field the step did not output', () => {
    expect(() =>
      resolveExpressions({ message: 'Hi {{steps.lookup.owner}}' }, steps),
    ).toThrow('steps.lookup.owner');
  });
});
