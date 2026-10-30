import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@odb/supabase';

export const SIGNING_UNDER_WAY: (string | null)[] = [
  'draft',
  'sent',
  'completed',
];

export type ExtensionState = 'draft' | 'out' | 'signed' | 'noted';

export function extensionState(extension: {
  signed: boolean;
  noted_on: string | null;
  signing_status: string | null;
}): ExtensionState {
  if (extension.signed) {
    return 'signed';
  }

  if (extension.noted_on !== null) {
    return 'noted';
  }

  return SIGNING_UNDER_WAY.includes(extension.signing_status) ? 'out' : 'draft';
}

type Summary = {
  id: string;
  type: string;
  versions: { id: string; version: number; is_signed: boolean }[];
};

export async function nestLoiExtensions<Contract extends Summary>(
  client: SupabaseClient<Database>,
  contracts: Contract[],
  side: 'buyer' | 'seller',
) {
  const shownExtensions = contracts.filter(
    (contract) => contract.type === 'loi_extension',
  );
  const others = contracts.filter(
    (contract) => contract.type !== 'loi_extension',
  );

  if (shownExtensions.length === 0) {
    return others.map((contract) => ({ ...contract, extensions: [] }));
  }

  const extensionIds = shownExtensions.map((contract) => contract.id);
  const [{ data: facts }, { data: notes }, { data: statuses }] =
    await Promise.all([
      client
        .from('contract')
        .select('id, parent_contract_id, extends_to, noted_on, current_version')
        .in('id', extensionIds)
        .order('created_at')
        .throwOnError(),
      side === 'buyer'
        ? client
            .from('contract')
            .select('id, note')
            .in('id', extensionIds)
            .throwOnError()
        : { data: [] },
      client
        .from('contract_version')
        .select('id, signing_status, extends_to')
        .in(
          'id',
          shownExtensions.flatMap((contract) =>
            contract.versions.map(({ id }) => id),
          ),
        )
        .throwOnError(),
    ]);
  const extensions = facts.map((fact) => {
    const shown = shownExtensions.find((contract) => contract.id === fact.id)!;
    const counting =
      side === 'buyer'
        ? fact.current_version
        : Math.max(...shown.versions.map(({ version }) => version));
    const countingIds = shown.versions
      .filter(({ version }) => version === counting)
      .map(({ id }) => id);
    const counted = statuses.find((status) => countingIds.includes(status.id));
    const state = extensionState({
      signed: shown.versions.some((version) => version.is_signed),
      noted_on: fact.noted_on,
      signing_status: counted?.signing_status ?? null,
    });
    const agreed = state === 'signed' || state === 'noted';

    return {
      ...shown,
      parent_contract_id: fact.parent_contract_id,
      extends_to:
        side === 'seller' && !agreed ? counted!.extends_to! : fact.extends_to!,
      noted_on: fact.noted_on,
      note:
        side === 'buyer' ? notes.find((row) => row.id === fact.id)!.note : null,
      state,
    };
  });

  return others.map((contract) => ({
    ...contract,
    extensions: extensions.filter(
      (extension) => extension.parent_contract_id === contract.id,
    ),
  }));
}
