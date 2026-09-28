import { describe, expect, it, vi } from 'vitest';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@tuckin/supabase';

import {
  fetchBrokerDealFlowByQuarter,
  fetchChecklistStatusByDeal,
  fetchContractTurnsPerDeal,
  fetchDealsAddedLostByMonth,
  fetchMeetingsHeldVsSkipped,
  fetchMedianDaysInStage,
  fetchOpenActionItemsByOwner,
  fetchPipelineByStage,
  fetchRequestedToReceivedMedian,
} from './queries';

function makeClient(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  const client = { rpc } as unknown as SupabaseClient<Database>;

  return { client, rpc };
}

describe('fetchPipelineByStage', () => {
  it('passes the account id and revenue flag to the rpc and returns the rows', async () => {
    const rows = [
      { stage: 'sourced', label: 'Sourced', deal_count: 2, total_revenue: 0 },
    ];
    const { client, rpc } = makeClient({ data: rows, error: null });

    const result = await fetchPipelineByStage(client, 'acc-1', true);

    expect(rpc).toHaveBeenCalledWith('analytics_pipeline_by_stage', {
      p_account_id: 'acc-1',
      p_include_revenue: true,
    });
    expect(result).toEqual(rows);
  });

  it('forwards a false revenue flag unchanged', async () => {
    const { client, rpc } = makeClient({ data: [], error: null });

    await fetchPipelineByStage(client, 'acc-1', false);

    expect(rpc).toHaveBeenCalledWith('analytics_pipeline_by_stage', {
      p_account_id: 'acc-1',
      p_include_revenue: false,
    });
  });

  it('throws when the rpc returns an error', async () => {
    const { client } = makeClient({ data: null, error: new Error('denied') });

    await expect(fetchPipelineByStage(client, 'acc-1', false)).rejects.toThrow(
      'denied',
    );
  });
});

describe('fetchDealsAddedLostByMonth', () => {
  it('passes the account id to the rpc and returns the rows', async () => {
    const rows = [{ month: '2026-01-01', added: 3, lost: 1 }];
    const { client, rpc } = makeClient({ data: rows, error: null });

    const result = await fetchDealsAddedLostByMonth(client, 'acc-1');

    expect(rpc).toHaveBeenCalledWith('analytics_deals_added_lost_by_month', {
      p_account_id: 'acc-1',
    });
    expect(result).toEqual(rows);
  });
});

describe('fetchMedianDaysInStage', () => {
  it('passes the account id to the rpc and returns the rows', async () => {
    const rows = [{ stage: 'qualifying', median_days: 12 }];
    const { client, rpc } = makeClient({ data: rows, error: null });

    const result = await fetchMedianDaysInStage(client, 'acc-1');

    expect(rpc).toHaveBeenCalledWith('analytics_median_days_in_stage', {
      p_account_id: 'acc-1',
    });
    expect(result).toEqual(rows);
  });
});

describe('fetchChecklistStatusByDeal', () => {
  it('passes the account id to the rpc and returns the rows', async () => {
    const rows = [{ deal_id: 'deal-1', status: 'received', item_count: 4 }];
    const { client, rpc } = makeClient({ data: rows, error: null });

    const result = await fetchChecklistStatusByDeal(client, 'acc-1');

    expect(rpc).toHaveBeenCalledWith('analytics_checklist_status_by_deal', {
      p_account_id: 'acc-1',
    });
    expect(result).toEqual(rows);
  });
});

describe('fetchRequestedToReceivedMedian', () => {
  it('passes the account id to the rpc and returns the scalar median', async () => {
    const { client, rpc } = makeClient({ data: 7.5, error: null });

    const result = await fetchRequestedToReceivedMedian(client, 'acc-1');

    expect(rpc).toHaveBeenCalledWith('analytics_requested_to_received_median', {
      p_account_id: 'acc-1',
    });
    expect(result).toBe(7.5);
  });
});

describe('fetchContractTurnsPerDeal', () => {
  it('passes the account id to the rpc and returns the rows', async () => {
    const rows = [{ deal_id: 'deal-1', turns: 3 }];
    const { client, rpc } = makeClient({ data: rows, error: null });

    const result = await fetchContractTurnsPerDeal(client, 'acc-1');

    expect(rpc).toHaveBeenCalledWith('analytics_contract_turns_per_deal', {
      p_account_id: 'acc-1',
    });
    expect(result).toEqual(rows);
  });
});

describe('fetchMeetingsHeldVsSkipped', () => {
  it('passes the account id to the rpc and returns the rows', async () => {
    const rows = [{ held: 5, skipped: 2 }];
    const { client, rpc } = makeClient({ data: rows, error: null });

    const result = await fetchMeetingsHeldVsSkipped(client, 'acc-1');

    expect(rpc).toHaveBeenCalledWith('analytics_meetings_held_vs_skipped', {
      p_account_id: 'acc-1',
    });
    expect(result).toEqual(rows);
  });
});

describe('fetchOpenActionItemsByOwner', () => {
  it('passes the account id to the rpc and returns the rows', async () => {
    const rows = [
      { owner_user_id: 'user-1', owner_is_seller: false, open_count: 2 },
    ];
    const { client, rpc } = makeClient({ data: rows, error: null });

    const result = await fetchOpenActionItemsByOwner(client, 'acc-1');

    expect(rpc).toHaveBeenCalledWith('analytics_open_action_items_by_owner', {
      p_account_id: 'acc-1',
    });
    expect(result).toEqual(rows);
  });
});

describe('fetchBrokerDealFlowByQuarter', () => {
  it('passes the account id and revenue flag to the rpc and returns the rows', async () => {
    const rows = [
      {
        quarter: '2026-01-01',
        broker_contact_id: 'contact-1',
        deal_count: 4,
        total_revenue: 0,
      },
    ];
    const { client, rpc } = makeClient({ data: rows, error: null });

    const result = await fetchBrokerDealFlowByQuarter(client, 'acc-1', true);

    expect(rpc).toHaveBeenCalledWith('analytics_broker_deal_flow_by_quarter', {
      p_account_id: 'acc-1',
      p_include_revenue: true,
    });
    expect(result).toEqual(rows);
  });
});
