import { describe, expect, it } from 'vitest';

import { mergeFieldTokens, renderTemplate } from './merge';

describe('renderTemplate', () => {
  it('substitutes a top-level dot path', () => {
    expect(renderTemplate('Hi {{ recipient.name }}', { recipient: { name: 'Dana' } })).toBe(
      'Hi Dana',
    );
  });

  it('substitutes nested dot paths from every group', () => {
    const context = {
      firm: { name: 'Acme HVAC' },
      dealBox: { revenueRange: '$1M to $5M', industries: 'home services' },
      sender: { name: 'Jordan' },
    };
    expect(
      renderTemplate(
        'Watching {{firm.name}} for a {{dealBox.industries}} deal at {{dealBox.revenueRange}}. {{sender.name}}',
        context,
      ),
    ).toBe('Watching Acme HVAC for a home services deal at $1M to $5M. Jordan');
  });

  it('uses the fallback when the value is missing', () => {
    expect(renderTemplate('Hi {{ recipient.name | there }}', {})).toBe('Hi there');
  });

  it('uses the fallback when the value is an empty string', () => {
    expect(renderTemplate('Hi {{ recipient.name | there }}', { recipient: { name: '' } })).toBe(
      'Hi there',
    );
  });

  it('prefers the value over the fallback when present', () => {
    expect(
      renderTemplate('Hi {{ recipient.name | there }}', { recipient: { name: 'Dana' } }),
    ).toBe('Hi Dana');
  });

  it('renders a missing value with no fallback as empty string', () => {
    expect(renderTemplate('Hi {{ recipient.name }}!', {})).toBe('Hi !');
  });

  it('renders an unknown token as empty string', () => {
    expect(renderTemplate('Hi {{ nope.nothere }}!', {})).toBe('Hi !');
  });

  it('tolerates arbitrary whitespace inside the braces', () => {
    expect(renderTemplate('Hi {{recipient.name}} and {{   recipient.name   }}', {
      recipient: { name: 'Dana' },
    })).toBe('Hi Dana and Dana');
  });
});

describe('mergeFieldTokens', () => {
  it('lists the supported dot-paths', () => {
    const tokens = mergeFieldTokens();
    expect(tokens).toContain('recipient.name');
    expect(tokens).toContain('firm.name');
    expect(tokens).toContain('dealBox.revenueRange');
    expect(tokens).toContain('sender.name');
  });
});
