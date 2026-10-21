'use client';

import { useState } from 'react';

import type { PathYear, ScenarioPathsResult } from '@odb/calculators';
import { Button } from '@odb/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@odb/ui/table';

import { money, ratio } from './calc-shared';

const PATHS = [
  { key: 'worst', title: 'Worst', color: 'var(--destructive)' },
  { key: 'good', title: 'Good', color: 'var(--primary)' },
  { key: 'great', title: 'Great', color: 'var(--chart-2)' },
] as const;

const CHART_WIDTH = 600;
const CHART_HEIGHT = 160;

type Paths = Extract<ScenarioPathsResult, { status: 'ready' }>['paths'];

type ChartMetric = 'net_cash_flow' | 'dscr' | 'sde';

const METRIC_LABELS: Record<ChartMetric, string> = {
  net_cash_flow: 'Net cash flow',
  dscr: 'DSCR',
  sde: 'SDE',
};

const METRICS: ChartMetric[] = ['net_cash_flow', 'dscr', 'sde'];

export function chartPoints(
  series: (number | null)[][],
  width: number,
  height: number,
): string[][] {
  const values = series.flat().filter((value) => value !== null);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const y = (value: number) =>
    max === min ? height / 2 : height - ((value - min) / (max - min)) * height;
  return series.map((line) => {
    const segments: string[][] = [[]];
    line.forEach((value, index) => {
      if (value === null) {
        segments.push([]);
        return;
      }
      segments.at(-1)!.push(`${(index * width) / (line.length - 1)},${y(value)}`);
    });
    return segments
      .filter((segment) => segment.length > 0)
      .map((segment) => segment.join(' '));
  });
}

export function PathsChart(props: { paths: Paths; metric: ChartMetric }) {
  const label = `${METRIC_LABELS[props.metric]} by path`;
  const lines = chartPoints(
    PATHS.map((path) => props.paths[path.key].map((year) => year[props.metric])),
    CHART_WIDTH,
    CHART_HEIGHT,
  );
  return (
    <svg
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      className={'h-40 w-full'}
      preserveAspectRatio={'none'}
      role={'img'}
      aria-label={label}
    >
      {PATHS.map((path, index) =>
        lines[index]!.map((points) => {
          if (!points.includes(' ')) {
            const [cx, cy] = points.split(',');
            return (
              <circle
                key={`${path.key}-${points}`}
                cx={cx}
                cy={cy}
                r={3}
                fill={path.color}
              />
            );
          }
          return (
            <polyline
              key={`${path.key}-${points}`}
              points={points}
              fill={'none'}
              stroke={path.color}
              strokeWidth={2}
              vectorEffect={'non-scaling-stroke'}
            />
          );
        }),
      )}
    </svg>
  );
}

export function ScenarioPathsOutputs(props: { result: ScenarioPathsResult }) {
  if (props.result.status === 'refused') {
    return (
      <p className={'text-muted-foreground text-sm'}>{props.result.message}</p>
    );
  }
  return <ReadyPaths paths={props.result.paths} />;
}

function ReadyPaths({ paths }: { paths: Paths }) {
  const [metric, setMetric] = useState<ChartMetric>('net_cash_flow');

  return (
    <div className={'flex flex-col gap-4'}>
      <div>
        <div className={'mb-2 flex gap-2'}>
          {METRICS.map((option) => (
            <Button
              key={option}
              size={'sm'}
              variant={option === metric ? 'default' : 'outline'}
              aria-pressed={option === metric}
              onClick={() => setMetric(option)}
            >
              {METRIC_LABELS[option]}
            </Button>
          ))}
        </div>
        <PathsChart paths={paths} metric={metric} />
        <div className={'flex gap-4 text-xs'}>
          {PATHS.map((path) => (
            <span key={path.key} className={'flex items-center gap-1'}>
              <span className={'inline-block h-2 w-4'} style={{ background: path.color }} />
              {path.title}
            </span>
          ))}
        </div>
      </div>
      {PATHS.map((path) => (
        <PathTable key={path.key} title={path.title} years={paths[path.key]} />
      ))}
    </div>
  );
}

function PathTable(props: { title: string; years: PathYear[] }) {
  return (
    <div>
      <h4 className={'text-muted-foreground mb-1 text-xs font-semibold uppercase'}>{props.title}</h4>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead />
            {props.years.map((year) => (
              <TableHead key={year.year}>Yr {year.year}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Revenue</TableCell>
            {props.years.map((year) => (
              <TableCell key={year.year}>{money(year.revenue)}</TableCell>
            ))}
          </TableRow>
          <TableRow>
            <TableCell>SDE</TableCell>
            {props.years.map((year) => (
              <TableCell key={year.year}>{money(year.sde)}</TableCell>
            ))}
          </TableRow>
          <TableRow>
            <TableCell>DSCR</TableCell>
            {props.years.map((year) =>
              year.below_minimum ? (
                <TableCell
                  key={year.year}
                  title={'Below minimum DSCR'}
                  className={'text-destructive font-semibold'}
                >
                  {ratio(year.dscr)}
                </TableCell>
              ) : (
                <TableCell key={year.year}>{ratio(year.dscr)}</TableCell>
              ),
            )}
          </TableRow>
          <TableRow>
            <TableCell>Net cash flow</TableCell>
            {props.years.map((year) => (
              <TableCell key={year.year}>{money(year.net_cash_flow)}</TableCell>
            ))}
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
