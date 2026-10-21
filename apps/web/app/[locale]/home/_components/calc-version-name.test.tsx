// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import { type NamedVersion, versionName } from './calc-version-name';
import { clearScreen, pageText, show } from './lender-test-kit';

afterEach(clearScreen);

function shown(version: NamedVersion) {
  show(<>{versionName(version, versions)}</>);
  const text = pageText();
  clearScreen();
  return text;
}

const savedAt = new Date(2026, 9, 20, 15, 14).toISOString();

function calc(
  id: string,
  type: string,
  created_at: string,
  overrides: Partial<NamedVersion> = {},
): NamedVersion {
  return {
    id,
    type,
    name: null,
    created_at,
    updated_at: savedAt,
    outputs_snapshot: { saved: true },
    ...overrides,
  };
}

const sdeOld = calc('sde-old', 'sde', '2026-10-01T00:00:00Z');
const dealMid = calc('deal-mid', 'deal', '2026-10-02T00:00:00Z');
const sdeNew = calc('sde-new', 'sde', '2026-10-03T00:00:00Z');
const versions = [sdeNew, dealMid, sdeOld];

describe('versionName', () => {
  it('uses the name a person gave the calc', () => {
    expect(
      shown({ ...sdeOld, name: 'Normalized 2025 SDE' }),
    ).toBe('Normalized 2025 SDE');
  });

  it('numbers unnamed versions per type, oldest first, with the last saved time', () => {
    expect(shown(sdeOld)).toBe('SDE v1, saved Oct 20 3:14 PM');
    expect(shown(sdeNew)).toBe('SDE v2, saved Oct 20 3:14 PM');
    expect(shown(dealMid)).toBe(
      'Deal v1, saved Oct 20 3:14 PM',
    );
  });

  it('treats a blank name as unnamed', () => {
    expect(shown({ ...dealMid, name: '  ' })).toBe(
      'Deal v1, saved Oct 20 3:14 PM',
    );
  });

  it('says a draft without saved outputs is not saved', () => {
    expect(shown({ ...sdeNew, outputs_snapshot: {} })).toBe(
      'SDE v2, not saved',
    );
  });
});
