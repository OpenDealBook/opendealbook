import { describe, expect, it } from 'vitest';

import { offsetLabel, shownOffset, storedOffset } from './offset';

describe('checklist due offsets', () => {
  it('stores closing days as negative numbers and shows them as days before close', () => {
    expect(storedOffset('closing', 5)).toBe(-5);
    expect(shownOffset('closing', -5)).toBe(5);
    expect(offsetLabel('closing')).toBe('days before close');
  });

  it('stores diligence and post-close days as entered', () => {
    expect(storedOffset('diligence', 7)).toBe(7);
    expect(shownOffset('post_close', 30)).toBe(30);
    expect(offsetLabel('diligence')).toBe('days after LOI signed');
    expect(offsetLabel('post_close')).toBe('days after close');
  });
});
