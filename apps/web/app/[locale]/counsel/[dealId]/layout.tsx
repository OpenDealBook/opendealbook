import type { ReactNode } from 'react';

import Link from 'next/link';

import {
  enterCounselPortalToRead,
  shouldAskCounselProfile,
} from '@odb/deal-counsel/portal-gate.ts';
import { dealDisplayName, outsideDealName } from '@odb/deals/shared';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { ItemFocus } from '../../home/_components/item-focus';
import { CounselNav } from './counsel-nav';
import { CounselDetailsMenu } from './details-form';

const SIDE_LABEL = { buyer: "Buyer's counsel", seller: "Seller's counsel" };

export default async function CounselPortalLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ dealId: string }>;
}) {
  const { dealId } = await params;

  const { sides, readOnlyReason } = await enterCounselPortalToRead(dealId);

  const client = getSupabaseServerClient();
  const {
    data: { user },
  } = await client.auth.getUser();

  const [prompt, { data: mine }, { data: deal }] = await Promise.all([
    shouldAskCounselProfile(client, dealId),
    client
      .from('deal_counsel')
      .select('name, phone')
      .eq('deal_id', dealId)
      .eq('user_id', user!.id)
      .limit(1)
      .single()
      .throwOnError(),
    // Service role: counsel are not deal members and cannot read the deal
    // row. enterCounselPortal proved the caller is counsel on this open deal.
    getSupabaseServerAdminClient()
      .from('deal')
      .select('code_name, firm!inner(name)')
      .eq('id', dealId)
      .single()
      .throwOnError(),
  ]);

  return (
    <div className={'flex flex-col gap-8'}>
      <header className={'flex flex-col gap-5 border-b'}>
        <Link
          href={'/counsel'}
          className={
            'text-muted-foreground hover:text-foreground w-fit text-sm'
          }
        >
          Back to all deals
        </Link>
        <div
          className={
            'flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'
          }
        >
          <div className={'flex min-w-0 flex-col gap-1'}>
            <h1
              className={
                'font-serif text-3xl leading-tight font-medium text-balance'
              }
            >
              {sides.includes('buyer')
                ? outsideDealName(deal)
                : dealDisplayName(deal)}
            </h1>
            <p className={'text-muted-foreground'}>
              {sides.map((side) => SIDE_LABEL[side]).join(', ')}
            </p>
          </div>
          {readOnlyReason ? (
            <p className={'text-muted-foreground text-sm'}>{readOnlyReason}</p>
          ) : (
            <CounselDetailsMenu
              dealId={dealId}
              name={mine.name}
              phone={mine.phone}
              prompt={prompt}
            />
          )}
        </div>
        <CounselNav
          dealId={dealId}
          sides={sides}
          readOnly={readOnlyReason !== null}
        />
      </header>
      <ItemFocus />
      {children}
    </div>
  );
}
