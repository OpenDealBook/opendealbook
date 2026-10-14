import { describe, expect, it } from 'vitest';

import { fitZoom, pageAfter, pageBefore, zoomIn, zoomOut } from './pdf-zoom';

describe('fitZoom', () => {
  it('scales a letter page to the width a desktop pane leaves after its padding', () => {
    expect(fitZoom(660, 612)).toBe(0.75);
  });

  it('goes below 50% on a 390 px phone so a 612 pt page does not scroll sideways', () => {
    expect(fitZoom(390, 612)).toBeCloseTo(342 / 816, 10);
  });

  it('never goes below 20%', () => {
    expect(fitZoom(100, 612)).toBe(0.2);
  });

  it('never goes above the largest zoom level', () => {
    expect(fitZoom(4000, 612)).toBe(3);
  });
});

describe('zoomIn', () => {
  it('steps to the next fixed level above the current zoom', () => {
    expect(zoomIn(0.87)).toBe(1);
    expect(zoomIn(1)).toBe(1.25);
  });

  it('stays put at the largest level', () => {
    expect(zoomIn(3)).toBe(3);
  });
});

describe('zoomOut', () => {
  it('steps to the next fixed level below the current zoom', () => {
    expect(zoomOut(0.87, 0.87)).toBe(0.75);
    expect(zoomOut(1, 0.87)).toBe(0.75);
  });

  it('stops at 50% when the page fits at a larger scale', () => {
    expect(zoomOut(0.5, 0.87)).toBe(0.5);
  });

  it('steps from 50% down to the fit scale when the page only fits below 50%', () => {
    expect(zoomOut(0.5, 0.42)).toBe(0.42);
  });

  it('stops at the fit scale when the page only fits below 50%', () => {
    expect(zoomOut(0.42, 0.42)).toBe(0.42);
  });
});

describe('pageBefore', () => {
  it('goes back one page', () => {
    expect(pageBefore(3)).toBe(2);
  });

  it('stays on the first page', () => {
    expect(pageBefore(1)).toBe(1);
  });
});

describe('pageAfter', () => {
  it('goes forward one page', () => {
    expect(pageAfter(1, 2)).toBe(2);
  });

  it('stays on the last page', () => {
    expect(pageAfter(2, 2)).toBe(2);
  });
});
