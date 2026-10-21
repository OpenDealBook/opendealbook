import { describe, expect, it } from 'vitest';

import { evaluateRule, MissingValue, ruleSchema, type Rule } from './rules';

const scope = {
  input: { fit: true, score: 72, firm: { state: 'TX' } },
  steps: { pull: { count: 12, closedOn: '2026-09-30' } },
};

describe('evaluateRule', () => {
  it('compares an input field to a literal', () => {
    expect(evaluateRule({ '==': [{ var: 'fit' }, true] }, scope)).toBe(true);
    expect(evaluateRule({ '!=': [{ var: 'firm.state' }, 'TX'] }, scope)).toBe(
      false,
    );
  });

  it('reads earlier step outputs through steps.<id>.<field>', () => {
    expect(
      evaluateRule({ '>': [{ var: 'steps.pull.count' }, 10] }, scope),
    ).toBe(true);
    expect(
      evaluateRule({ '<=': [{ var: 'steps.pull.count' }, 11] }, scope),
    ).toBe(false);
  });

  it('orders numbers and strings', () => {
    expect(evaluateRule({ '<': [{ var: 'score' }, 80] }, scope)).toBe(true);
    expect(evaluateRule({ '>=': [{ var: 'score' }, 72] }, scope)).toBe(true);
    expect(
      evaluateRule(
        { '<': [{ var: 'steps.pull.closedOn' }, '2026-10-01'] },
        scope,
      ),
    ).toBe(true);
  });

  it('combines rules with and, or and not', () => {
    const fitTexan: Rule = {
      and: [
        { '==': [{ var: 'fit' }, true] },
        { '==': [{ var: 'firm.state' }, 'TX'] },
      ],
    };
    expect(evaluateRule(fitTexan, scope)).toBe(true);
    expect(evaluateRule({ not: fitTexan }, scope)).toBe(false);
    expect(
      evaluateRule(
        { or: [{ '==': [{ var: 'score' }, 1] }, { not: { '==': [1, 2] } }] },
        scope,
      ),
    ).toBe(true);
  });

  it('refuses a var that names nothing', () => {
    expect(() =>
      evaluateRule({ '==': [{ var: 'steps.pull.missing' }, 1] }, scope),
    ).toThrow('steps.pull.missing does not name a value');
    expect(() =>
      evaluateRule({ '==': [{ var: 'steps.pull.missing' }, 1] }, scope),
    ).toThrow(
      expect.objectContaining({
        constructor: MissingValue,
        path: 'steps.pull.missing',
      }),
    );
  });

  it('refuses to order a number against text', () => {
    expect(() =>
      evaluateRule({ '<': [{ var: 'score' }, 'high'] }, scope),
    ).toThrow('Cannot order 72 and "high"');
  });
});

describe('ruleSchema', () => {
  it('accepts nested rules and refuses unknown operators', () => {
    expect(
      ruleSchema.safeParse({ and: [{ not: { '==': [{ var: 'fit' }, true] } }] })
        .success,
    ).toBe(true);
    expect(ruleSchema.safeParse({ in: [{ var: 'fit' }, [true]] }).success).toBe(
      false,
    );
    expect(ruleSchema.safeParse({ '==': [{ var: 'fit' }] }).success).toBe(
      false,
    );
  });
});
