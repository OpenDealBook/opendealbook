import type { DealListGroup, FacetCount } from '@odb/deals';

export interface PipelineStage {
  key: string;
  label: string;
}

export interface GroupCount {
  group: DealListGroup;
  count: number;
}

export interface StageCount {
  key: string;
  label: string;
  count: number;
}

export interface FunnelStep {
  key: string;
  label: string;
  reached: number;
  advanced: number;
  dropped: number;
  conversion: number | null;
}

export interface ResolutionSummary {
  won: number;
  lost: number;
  abandoned: number;
  winRate: number;
}

export interface PipelineReport {
  activeTotal: number;
  groups: GroupCount[];
  stageDistribution: StageCount[];
  funnel: FunnelStep[];
  resolution: ResolutionSummary;
}

export interface PipelineReportInput {
  groupFacets: FacetCount[];
  stageFacets: FacetCount[];
  resolutionFacets: FacetCount[];
  reach: Map<string, Set<string>>;
  stages: PipelineStage[];
}

const GROUP_ORDER: DealListGroup[] = [
  'actively_pursuing',
  'early_funnel',
  'closed_off_track',
  'archived',
];

const ACTIVE_GROUPS: DealListGroup[] = ['actively_pursuing', 'early_funnel'];

function facetValue(facets: FacetCount[], value: string): number {
  return facets.find((facet) => facet.value === value)?.count ?? 0;
}

function reachedCount(reach: Map<string, Set<string>>, key: string): number {
  let count = 0;
  for (const stages of reach.values()) {
    if (stages.has(key)) {
      count += 1;
    }
  }
  return count;
}

export function buildPipelineReport(input: PipelineReportInput): PipelineReport {
  const groups = GROUP_ORDER.map((group) => ({
    group,
    count: facetValue(input.groupFacets, group),
  }));

  const activeTotal = ACTIVE_GROUPS.reduce(
    (total, group) => total + facetValue(input.groupFacets, group),
    0,
  );

  const stageDistribution = input.stages.map((stage) => ({
    key: stage.key,
    label: stage.label,
    count: facetValue(input.stageFacets, stage.key),
  }));

  const funnel = input.stages.map((stage, index) => {
    const reached = reachedCount(input.reach, stage.key);
    const next = input.stages[index + 1];
    if (next === undefined) {
      return {
        key: stage.key,
        label: stage.label,
        reached,
        advanced: 0,
        dropped: 0,
        conversion: null,
      };
    }
    const advanced = reachedCount(input.reach, next.key);
    return {
      key: stage.key,
      label: stage.label,
      reached,
      advanced,
      dropped: reached - advanced,
      conversion: reached === 0 ? 0 : advanced / reached,
    };
  });

  const won = facetValue(input.resolutionFacets, 'won');
  const lost = facetValue(input.resolutionFacets, 'lost');
  const abandoned = facetValue(input.resolutionFacets, 'abandoned');
  const resolved = won + lost + abandoned;

  return {
    activeTotal,
    groups,
    stageDistribution,
    funnel,
    resolution: {
      won,
      lost,
      abandoned,
      winRate: resolved === 0 ? 0 : won / resolved,
    },
  };
}
