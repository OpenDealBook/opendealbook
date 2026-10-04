import { describe, expect, it } from 'vitest';

import { buildPipelineReport, type PipelineReportInput } from './pipeline-report';

const stages = [
  { key: 'sourcing', label: 'Sourcing' },
  { key: 'pre_nda', label: 'Pre-NDA' },
  { key: 'nda', label: 'NDA' },
  { key: 'offer', label: 'Offer' },
];

function baseInput(): PipelineReportInput {
  return {
    deals: [
      { group: 'actively_pursuing' },
      { group: 'actively_pursuing' },
      { group: 'early_funnel' },
      { group: 'closed_off_track' },
      { group: 'archived' },
    ],
    stageFacets: [
      { value: 'sourcing', count: 1 },
      { value: 'pre_nda', count: 1 },
      { value: 'nda', count: 2 },
      { value: 'offer', count: 1 },
    ],
    resolutionFacets: [
      { value: 'open', count: 3 },
      { value: 'won', count: 1 },
      { value: 'lost', count: 1 },
      { value: 'abandoned', count: 1 },
    ],
    reach: new Map([
      ['d1', new Set(['sourcing', 'pre_nda', 'nda'])],
      ['d2', new Set(['sourcing', 'pre_nda', 'nda', 'offer'])],
      ['d3', new Set(['sourcing', 'pre_nda'])],
      ['d4', new Set(['sourcing'])],
      ['d5', new Set(['sourcing', 'pre_nda', 'nda'])],
    ]),
    stages,
  };
}

describe('buildPipelineReport', () => {
  it('counts active deals by funnel group', () => {
    const report = buildPipelineReport(baseInput());

    expect(report.activeTotal).toBe(3);
    expect(report.groups).toEqual([
      { group: 'actively_pursuing', count: 2 },
      { group: 'early_funnel', count: 1 },
      { group: 'closed_off_track', count: 1 },
      { group: 'archived', count: 1 },
    ]);
  });

  it('reports current stage distribution in stage order', () => {
    const report = buildPipelineReport(baseInput());

    expect(report.stageDistribution).toEqual([
      { key: 'sourcing', label: 'Sourcing', count: 1 },
      { key: 'pre_nda', label: 'Pre-NDA', count: 1 },
      { key: 'nda', label: 'NDA', count: 2 },
      { key: 'offer', label: 'Offer', count: 1 },
    ]);
  });

  it('derives the fall-off funnel from stage-reach history', () => {
    const report = buildPipelineReport(baseInput());

    expect(report.funnel.map((step) => step.reached)).toEqual([5, 4, 3, 1]);
    expect(report.funnel.map((step) => step.advanced)).toEqual([4, 3, 1, 0]);
    expect(report.funnel.map((step) => step.dropped)).toEqual([1, 1, 2, 0]);
    expect(report.funnel[0]!.conversion).toBe(0.8);
    expect(report.funnel[1]!.conversion).toBe(0.75);
    expect(report.funnel[2]!.conversion).toBeCloseTo(1 / 3);
  });

  it('treats the terminal stage as completion, not fall-off', () => {
    const report = buildPipelineReport(baseInput());
    const terminal = report.funnel[report.funnel.length - 1]!;

    expect(terminal.key).toBe('offer');
    expect(terminal.dropped).toBe(0);
    expect(terminal.conversion).toBeNull();
  });

  it('summarizes resolutions with a win rate', () => {
    const report = buildPipelineReport(baseInput());

    expect(report.resolution).toEqual({
      won: 1,
      lost: 1,
      abandoned: 1,
      winRate: 1 / 3,
    });
  });

  it('reports a zero win rate when nothing is resolved', () => {
    const input = baseInput();
    input.resolutionFacets = [{ value: 'open', count: 2 }];

    const report = buildPipelineReport(input);

    expect(report.resolution).toEqual({
      won: 0,
      lost: 0,
      abandoned: 0,
      winRate: 0,
    });
  });
});
