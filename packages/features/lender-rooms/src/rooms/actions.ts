'use server';

import { z } from 'zod';

import { deterministicUuid } from '@odb/contracts/esign';
import type { TablesUpdate } from '@odb/supabase';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { refusableAction } from '../actions/refusable-action';
import { Refusal } from '../actions/refusal';
import { refuseWhileTeamLocked } from '../actions/team-lock';
import { brandDomain } from '../brand/domain';
import { closeState, forgetRoomClosing, prepareRoomClose } from './closing';
import { endOfDayIn, isTimeZone } from './end-of-day';

const roomIdInput = z.object({ roomId: z.uuid() });

function sixtyDaysFromNow() {
  return new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
}

async function updateRoom(roomId: string, changes: TablesUpdate<'lender_room'>) {
  await getSupabaseServerClient()
    .from('lender_room')
    .update(changes)
    .eq('id', roomId)
    .select('id')
    .single()
    .throwOnError();
}

async function readRoom(roomId: string) {
  const { data: room } = await getSupabaseServerClient()
    .from('lender_room')
    .select('status, closed_at, expires_at, name')
    .eq('id', roomId)
    .single()
    .throwOnError();

  return room;
}

const UNIQUE_VIOLATION = '23505';

async function lookedUpDomain(website: string) {
  const domain = brandDomain(website);

  if (domain === null) {
    throw new Refusal('Enter a website like firstbank.com, or leave it empty');
  }

  const { data: brand } = await getSupabaseServerAdminClient()
    .from('lender_brand')
    .select('domain')
    .eq('domain', domain)
    .maybeSingle()
    .throwOnError();

  if (!brand) {
    throw new Refusal('Look the website up before creating the room');
  }

  return domain;
}

async function refuseSecondRoomForWebsite(dealId: string, domain: string) {
  const { data: sameWebsite } = await getSupabaseServerClient()
    .from('lender_room')
    .select('name')
    .eq('deal_id', dealId)
    .eq('brand_domain', domain)
    .limit(1)
    .throwOnError();

  const [existing] = sameWebsite;

  if (existing) {
    throw new Refusal(`${existing.name} already has a room on this deal`);
  }
}

async function readManagedDeal(dealId: string) {
  const client = getSupabaseServerClient();

  const { data: deal } = await client
    .from('deal')
    .select('account_id')
    .eq('id', dealId)
    .maybeSingle()
    .throwOnError();

  if (!deal) {
    throw new Refusal('Only the deal team can do that');
  }

  const { data: manages } = await client
    .rpc('manages_deal_in_account', {
      deal_id: dealId,
      account_id: deal.account_id,
    })
    .throwOnError();

  if (!manages) {
    throw new Refusal('Only the deal team can do that');
  }

  return deal;
}

async function ensureLenderPackage(dealOwnership: {
  account_id: string;
  deal_id: string;
}) {
  const client = getSupabaseServerClient();

  const { data: lenderPackage } = await client
    .from('lender_package')
    .select('master_folder_id')
    .eq('deal_id', dealOwnership.deal_id)
    .maybeSingle()
    .throwOnError();

  if (lenderPackage) {
    return lenderPackage.master_folder_id;
  }

  const masterFolderId = deterministicUuid(
    `lender-package:${dealOwnership.deal_id}`,
  );

  const folder = await client
    .from('dr_folder')
    .insert({ ...dealOwnership, id: masterFolderId, name: 'Lender package' });

  if (folder.error && folder.error.code !== UNIQUE_VIOLATION) {
    throw folder.error;
  }

  await client
    .from('lender_package')
    .upsert(
      { ...dealOwnership, master_folder_id: masterFolderId },
      { onConflict: 'deal_id', ignoreDuplicates: true },
    )
    .throwOnError();

  return masterFolderId;
}

export const startLenderPackage = refusableAction(
  async (input) => {
    const deal = await readManagedDeal(input.dealId);

    return ensureLenderPackage({
      account_id: deal.account_id,
      deal_id: input.dealId,
    });
  },
  { auth: true, schema: z.object({ dealId: z.uuid() }) },
);

export const createLenderRoom = refusableAction(
  async (input) => {
    const client = getSupabaseServerClient();
    const deal = await readManagedDeal(input.dealId);

    const dealOwnership = {
      account_id: deal.account_id,
      deal_id: input.dealId,
    };

    const roomBrandDomain =
      input.brandDomain === undefined
        ? null
        : await lookedUpDomain(input.brandDomain);

    if (roomBrandDomain !== null) {
      await refuseSecondRoomForWebsite(input.dealId, roomBrandDomain);
    }

    await ensureLenderPackage(dealOwnership);

    const { data: privateFolder } = await client
      .from('dr_folder')
      .insert({ ...dealOwnership, name: input.name })
      .select('id')
      .single()
      .throwOnError();

    const inserted = await client
      .from('lender_room')
      .insert({
        ...dealOwnership,
        name: input.name,
        brand_domain: roomBrandDomain,
        lender_id: input.lenderId,
        welcome_note: input.welcomeNote,
        private_folder_id: privateFolder.id,
      })
      .select('id')
      .single();

    if (inserted.error) {
      if (
        inserted.error.code === UNIQUE_VIOLATION &&
        roomBrandDomain !== null
      ) {
        await refuseSecondRoomForWebsite(input.dealId, roomBrandDomain);
      }

      throw inserted.error;
    }

    return inserted.data.id;
  },
  {
    auth: true,
    schema: z.object({
      dealId: z.uuid(),
      name: z.string().trim().min(1, "Enter the lender's name"),
      brandDomain: z.string().optional(),
      lenderId: z.uuid().optional(),
      welcomeNote: z.string().optional(),
    }),
  },
);

export const setLenderRoomStatus = refusableAction(
  async (input) => {
    if (input.status === 'selected') {
      return updateRoom(input.roomId, { status: 'selected', expires_at: null });
    }

    const room = await readRoom(input.roomId);

    return updateRoom(
      input.roomId,
      room.status === 'selected'
        ? { status: input.status, expires_at: sixtyDaysFromNow() }
        : { status: input.status },
    );
  },
  {
    auth: true,
    schema: roomIdInput.extend({
      status: z.enum([
        'invited',
        'reviewing',
        'term_sheet',
        'declined',
        'selected',
      ]),
    }),
  },
);

export const setLenderRoomExpiry = refusableAction(
  async (input) => {
    const room = await readRoom(input.roomId);

    if (room.status === 'selected') {
      throw new Refusal('A selected room has no expiry');
    }

    if (!isTimeZone(input.timeZone)) {
      throw new Refusal(
        'Your time zone could not be read. Reload the page and try again',
      );
    }

    return updateRoom(input.roomId, { expires_at: endOfDayIn(input) });
  },
  {
    auth: true,
    schema: roomIdInput.extend({ date: z.iso.date(), timeZone: z.string() }),
  },
);

function lenderClosingTodo(roomName: string) {
  return `Tell ${roomName} the room is closing`;
}

export const prepareLenderRoomClose = refusableAction(
  async (input, user) => {
    const { data: room } = await getSupabaseServerClient()
      .from('lender_room')
      .select('account_id, deal_id, name, closed_at')
      .eq('id', input.roomId)
      .single()
      .throwOnError();

    if (room.closed_at !== null) {
      throw new Refusal('This room is already closed');
    }

    await refuseWhileTeamLocked(room.account_id);

    await prepareRoomClose(
      getSupabaseServerAdminClient(),
      {
        kind: 'lender',
        roomId: input.roomId,
        accountId: room.account_id,
        dealId: room.deal_id,
        title: lenderClosingTodo(room.name),
      },
      user.id,
    );
  },
  { auth: true, schema: roomIdInput },
);

export const closeLenderRoom = refusableAction(
  async (input, user) => {
    const room = await readRoom(input.roomId);

    if (room.closed_at !== null) {
      throw new Refusal('This room is already closed');
    }

    const admin = getSupabaseServerAdminClient();
    const closing = { kind: 'lender' as const, roomId: input.roomId };

    if (!(await closeState(admin, closing, user.id)).ready) {
      throw new Refusal(`${lenderClosingTodo(room.name)} first`);
    }

    await updateRoom(input.roomId, { closed_at: new Date().toISOString() });
    await forgetRoomClosing(admin, closing);
  },
  { auth: true, schema: roomIdInput },
);

export const reopenLenderRoom = refusableAction(
  async (input) => {
    const room = await readRoom(input.roomId);

    if (
      room.closed_at === null &&
      (room.expires_at === null || new Date(room.expires_at) > new Date())
    ) {
      throw new Refusal('This room is already open');
    }

    return updateRoom(
      input.roomId,
      room.status === 'selected'
        ? { closed_at: null }
        : { closed_at: null, expires_at: sixtyDaysFromNow() },
    );
  },
  { auth: true, schema: roomIdInput },
);

export const setLenderRoomWelcomeNote = refusableAction(
  async (input) =>
    updateRoom(input.roomId, { welcome_note: input.welcomeNote }),
  {
    auth: true,
    schema: roomIdInput.extend({
      welcomeNote: z
        .string()
        .nullable()
        .transform((note) => note || null),
    }),
  },
);

export const listLenderRooms = refusableAction(
  async (input) => {
    const client = getSupabaseServerClient();

    await client
      .from('deal')
      .select('id')
      .eq('id', input.dealId)
      .single()
      .throwOnError();

    const { data: rooms } = await client
      .from('lender_room')
      .select('id, name, status, expires_at, closed_at, brand_domain')
      .eq('deal_id', input.dealId)
      .order('created_at')
      .throwOnError();

    return rooms;
  },
  { auth: true, schema: z.object({ dealId: z.uuid() }) },
);

