'use server';

import type { PostgrestError } from '@supabase/supabase-js';

import type { z } from 'zod';

import { getSupabaseServerClient } from '@odb/supabase/server';

import { refusableAction } from '../../actions/refusable-action';
import { Refusal } from '../../actions/refusal';
import { refuseWhileTeamLocked } from '../../actions/team-lock';
import { brandDomain } from '../../brand/domain';
import {
  addLenderContactInput,
  addLenderInput,
  editLenderContactInput,
  editLenderInput,
  lenderContactIdInput,
  lenderIdInput,
} from './schema';

const UNIQUE_VIOLATION = '23505';

function domainOf(website: string) {
  const domain = brandDomain(website);

  if (domain === null) {
    throw new Refusal('Enter a website like firstbank.com');
  }

  return domain;
}

function refuseDuplicateDomain(error: PostgrestError | null) {
  if (error?.code === UNIQUE_VIOLATION) {
    throw new Refusal('This team already saved a lender with that website');
  }

  if (error) {
    throw error;
  }
}

async function refuseUnlessMayEdit(accountId: string, userId: string) {
  const { data: mayManage } = await getSupabaseServerClient()
    .rpc('has_permission', {
      account_id: accountId,
      permission_name: 'deals.manage',
      user_id: userId,
    })
    .throwOnError();

  if (!mayManage) {
    throw new Refusal('Only the deal team can do that');
  }

  await refuseWhileTeamLocked(accountId);
}

async function readLenderAccount(lenderId: string) {
  const { data: lender } = await getSupabaseServerClient()
    .from('lender')
    .select('account_id')
    .eq('id', lenderId)
    .maybeSingle()
    .throwOnError();

  if (!lender) {
    throw new Refusal('Only the deal team can do that');
  }

  return lender.account_id;
}

async function readContact(contactId: string) {
  const { data: contact } = await getSupabaseServerClient()
    .from('lender_contact')
    .select('account_id, email, is_primary')
    .eq('id', contactId)
    .maybeSingle()
    .throwOnError();

  if (!contact) {
    throw new Refusal('Only the deal team can do that');
  }

  return contact;
}

function lenderColumns(
  input: Partial<z.infer<typeof addLenderInput>> & { website?: string },
) {
  return {
    name: input.name,
    website: input.website,
    domain: input.website === undefined ? undefined : domainOf(input.website),
    rate_type: input.rateType,
    typical_rate: input.typicalRate,
    max_loan: input.maxLoan,
    sba_preferred: input.sbaPreferred,
    industries: input.industries,
    states: input.states,
    tags: input.tags,
    notes: input.notes,
  };
}

export const addLender = refusableAction(
  async (input, user) => {
    const { accountId, ...profile } = input;

    await refuseUnlessMayEdit(accountId, user.id);

    const inserted = await getSupabaseServerClient()
      .from('lender')
      .insert({
        ...lenderColumns(profile),
        account_id: accountId,
        name: profile.name,
        website: profile.website,
        domain: domainOf(profile.website),
      })
      .select('id')
      .single();

    refuseDuplicateDomain(inserted.error);

    return inserted.data!.id;
  },
  { auth: true, schema: addLenderInput },
);

export const editLender = refusableAction(
  async (input, user) => {
    const { lenderId, ...changes } = input;

    await refuseUnlessMayEdit(await readLenderAccount(lenderId), user.id);

    const updated = await getSupabaseServerClient()
      .from('lender')
      .update(lenderColumns(changes))
      .eq('id', lenderId)
      .select('id')
      .single();

    refuseDuplicateDomain(updated.error);
  },
  { auth: true, schema: editLenderInput },
);

export const deleteLender = refusableAction(
  async (input, user) => {
    await refuseUnlessMayEdit(await readLenderAccount(input.lenderId), user.id);

    await getSupabaseServerClient()
      .from('lender')
      .delete()
      .eq('id', input.lenderId)
      .select('id')
      .single()
      .throwOnError();
  },
  { auth: true, schema: lenderIdInput },
);

export const addLenderContact = refusableAction(
  async (input, user) => {
    const accountId = await readLenderAccount(input.lenderId);

    await refuseUnlessMayEdit(accountId, user.id);

    const { data: contact } = await getSupabaseServerClient()
      .from('lender_contact')
      .insert({
        account_id: accountId,
        lender_id: input.lenderId,
        name: input.name,
        email: input.email,
        phone: input.phone,
      })
      .select('id')
      .single()
      .throwOnError();

    return contact.id;
  },
  { auth: true, schema: addLenderContactInput },
);

export const editLenderContact = refusableAction(
  async (input, user) => {
    const { contactId, ...changes } = input;
    const contact = await readContact(contactId);

    await refuseUnlessMayEdit(contact.account_id, user.id);

    if (contact.is_primary && changes.email === null) {
      throw new Refusal('The primary contact needs an email');
    }

    await getSupabaseServerClient()
      .from('lender_contact')
      .update(changes)
      .eq('id', contactId)
      .select('id')
      .single()
      .throwOnError();
  },
  { auth: true, schema: editLenderContactInput },
);

export const deleteLenderContact = refusableAction(
  async (input, user) => {
    await refuseUnlessMayEdit(
      (await readContact(input.contactId)).account_id,
      user.id,
    );

    await getSupabaseServerClient()
      .from('lender_contact')
      .delete()
      .eq('id', input.contactId)
      .select('id')
      .single()
      .throwOnError();
  },
  { auth: true, schema: lenderContactIdInput },
);

export const setPrimaryLenderContact = refusableAction(
  async (input, user) => {
    const contact = await readContact(input.contactId);

    await refuseUnlessMayEdit(contact.account_id, user.id);

    if (contact.email === null) {
      throw new Refusal('Add an email before making this the primary contact');
    }

    await getSupabaseServerClient()
      .rpc('set_lender_contact_primary', { contact_id: input.contactId })
      .throwOnError();
  },
  { auth: true, schema: lenderContactIdInput },
);
