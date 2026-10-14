'use client';

import type { Enums } from '@odb/supabase';

import { returnRouteAction, returnRouteChoice, teamName } from './wording';

type ReturnRoute = Enums<'lender_return_route'>;

const routeDetail = {
  upload: 'The completed file is added to this room.',
  esign: 'The signed PDF is added to this room.',
} satisfies Record<ReturnRoute, string>;

function startsWithCapital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function offeredRoute(
  fileName: string,
  chosen: ReturnRoute,
  isEsignAvailable: boolean,
): ReturnRoute {
  return returnRouteChoice(
    fileName,
    'upload',
    isEsignAvailable,
  ).routes.includes(chosen)
    ? chosen
    : 'upload';
}

export function ReturnRouteChoice({
  fileName,
  screen,
  dealName,
  chosen,
  onChoose,
}: {
  fileName: string;
  screen: Parameters<typeof returnRouteChoice>[1];
  dealName: string | null;
  chosen: ReturnRoute;
  onChoose: (route: ReturnRoute) => void;
}) {
  const choice = returnRouteChoice(fileName, screen, true);

  return (
    <fieldset className={'flex flex-col gap-2'}>
      <legend className={'mb-2 text-sm font-medium'}>
        How should {teamName(dealName)} return this form?
      </legend>
      {choice.routes.map((route) => (
        <label
          key={route}
          className={
            'has-checked:border-ring has-checked:bg-secondary has-focus-visible:ring-ring/50 flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm has-focus-visible:ring-[3px]'
          }
        >
          <input
            type={'radio'}
            name={'returnRoute'}
            value={route}
            className={'accent-primary size-6 shrink-0'}
            checked={offeredRoute(fileName, chosen, true) === route}
            onChange={() => onChoose(route)}
          />
          <span className={'flex flex-col'}>
            <span className={'font-medium'}>
              {startsWithCapital(returnRouteAction[route])}
            </span>
            <span className={'text-muted-foreground'}>
              {routeDetail[route]}
            </span>
          </span>
        </label>
      ))}
      {choice.hint ? (
        <p className={'text-muted-foreground text-sm'}>{choice.hint}</p>
      ) : null}
    </fieldset>
  );
}
