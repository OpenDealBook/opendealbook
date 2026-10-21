'use client';

import Link from 'next/link';

import { Badge } from '@odb/ui/badge';
import { Button } from '@odb/ui/button';
import { Card, CardContent } from '@odb/ui/card';

import { CalcDealEditor } from '../../../../../../_components/calc-deal-editor';
import { CalcSdeEditor } from '../../../../../../_components/calc-sde-editor';
import {
  type CalcDetail,
  TYPE_LABELS,
  calcDraftFromDetail,
  versionName,
} from '../../../../../../_components/calc-shared';
import type { NamedVersion } from '../../../../../../_components/calc-version-name';
import { CalcWorkingCapitalEditor } from '../../../../../../_components/calc-working-capital-editor';
import type { DealCalcDefaults } from '../../../../../../_lib/deal-calc-defaults';

export function CalcVersionEditor(props: {
  detail: CalcDetail;
  versions: NamedVersion[];
  defaults: DealCalcDefaults;
  dealBox: { set: boolean; href: string };
  financialsHref: string;
  calcsHref: string;
}) {
  const version = props.detail.version;
  const calc = calcDraftFromDetail(props.detail, props.defaults);
  const others = props.versions.filter(
    (other) => other.type === version.type && other.id !== version.id,
  );

  const href = `${props.calcsHref}/${version.id}`;

  return (
    <div className={'flex flex-col gap-6'}>
      <div className={'flex flex-wrap items-end justify-between gap-4'}>
        <div className={'flex flex-col gap-2'}>
          <Link
            href={props.financialsHref}
            className={
              'text-muted-foreground hover:text-foreground w-fit text-sm'
            }
          >
            Back to Financials
          </Link>
          <div className={'flex flex-wrap items-center gap-2'}>
            <h1 className={'text-xl font-semibold'}>
              {versionName(version, props.versions)}
            </h1>
            <Badge variant={'outline'}>{TYPE_LABELS[calc.kind]}</Badge>
            {version.is_primary ? <Badge>Primary</Badge> : null}
          </div>
        </div>
        <Button
          variant={'outline'}
          size={'sm'}
          onClick={() => window.open(href, `odb-calc-${version.id}`, 'popup')}
        >
          Open in new window
        </Button>
        {others.length > 0 ? (
          <nav
            aria-label={'Compare with'}
            className={'flex flex-wrap items-center gap-2'}
          >
            <span className={'text-muted-foreground text-sm'}>
              Compare with
            </span>
            {others.map((other) => (
              <Button key={other.id} variant={'outline'} size={'sm'} asChild>
                <Link
                  href={`${props.calcsHref}/compare?a=${version.id}&b=${other.id}`}
                >
                  {versionName(other, props.versions)}
                </Link>
              </Button>
            ))}
          </nav>
        ) : null}
      </div>

      <Card>
        <CardContent>
          {calc.kind === 'sde' ? (
            <CalcSdeEditor
              calcVersionId={version.id}
              initialPeriods={calc.periods}
              sources={props.detail.sources}
            />
          ) : null}
          {calc.kind === 'deal' ? (
            <CalcDealEditor
              calcVersionId={version.id}
              initial={calc.draft}
              sdeVersions={props.versions
                .filter((other) => other.type === 'sde')
                .map((other) => ({
                  id: other.id,
                  name: versionName(other, props.versions),
                }))}
              defaultAfterStandby={props.defaults.afterStandby}
              dealBox={props.dealBox}
              sources={props.detail.sources}
            />
          ) : null}
          {calc.kind === 'working_capital' ? (
            <CalcWorkingCapitalEditor
              calcVersionId={version.id}
              initial={calc.draft}
              sources={props.detail.sources}
            />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
