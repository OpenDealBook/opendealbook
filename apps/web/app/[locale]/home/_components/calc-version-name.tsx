import type { ReactNode } from 'react';

import { calcTypeSchema } from '@odb/deals/schema';
import { outputsSaved } from '@odb/deals/shared';
import type { Tables } from '@odb/supabase';

import { SavedAt } from './saved-at';

export const TYPE_LABELS: Record<string, string> = {
  sde: 'SDE',
  deal: 'Deal',
  working_capital: 'Working capital',
};

export type NamedVersion = Pick<
  Tables<'calc_version'>,
  'id' | 'name' | 'type' | 'created_at' | 'updated_at' | 'outputs_snapshot'
>;

export function versionName(
  version: NamedVersion,
  versions: Pick<NamedVersion, 'id' | 'type' | 'created_at'>[],
): ReactNode {
  if (version.name != null && version.name.trim() !== '') {
    return version.name;
  }
  const number =
    versions
      .filter((other) => other.type === version.type)
      .sort((a, b) => a.created_at!.localeCompare(b.created_at!))
      .findIndex((other) => other.id === version.id) + 1;
  const label = `${TYPE_LABELS[calcTypeSchema.parse(version.type)]} v${number}`;
  if (!outputsSaved(version.outputs_snapshot)) {
    return `${label}, not saved`;
  }
  return (
    <>
      {label}, saved <SavedAt iso={version.updated_at!} />
    </>
  );
}
