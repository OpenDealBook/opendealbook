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

function dealsReaching(
  reach: Map<string, Set<string>>,
  key: string,
): Set<string>[] {
  return [...reach.values()].filter((stages) => stages.has(key));
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

  const funnel = input.stages
    .map((stage, index) => {
      const reaching = dealsReaching(input.reach, stage.key);
      const reached = reaching.length;
      const later = input.stages.slice(index + 1);
      if (later.length === 0) {
        return {
          key: stage.key,
          label: stage.label,
          reached,
          advanced: 0,
          dropped: 0,
          conversion: null,
        };
      }
      const advanced = reaching.filter((stages) =>
        later.some((next) => stages.has(next.key)),
      ).length;
      return {
        key: stage.key,
        label: stage.label,
        reached,
        advanced,
        dropped: reached - advanced,
        conversion: advanced / reached,
      };
    })
    .filter((step) => step.reached > 0);

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
