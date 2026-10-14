import 'server-only';
import { brandLogoUrl } from '@odb/lender-rooms/brand/logo-url.ts';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { LenderTeamContacts } from './lender-team-contacts';
import { LenderTeamRooms } from './lender-team-rooms';
import { teamContacts, teamRooms } from './lender-team-rows';

async function withLogoUrls<Row extends { logoPath: string | null }>(
  rows: Row[],
): Promise<(Omit<Row, 'logoPath'> & { logoUrl: string | null })[]> {
  const urls = new Map(
    await Promise.all(
      [...new Set(rows.map((row) => row.logoPath))].map(
        async (path) =>
          [path, path === null ? null : await brandLogoUrl(path)] as const,
      ),
    ),
  );

  return rows.map(({ logoPath, ...row }) => ({
    ...row,
    logoUrl: urls.get(logoPath) ?? null,
  }));
}

export async function LenderTeamRoomsPage({
  teamId,
  teamPath,
}: {
  teamId: string;
  teamPath: string;
}) {
  const { data } = await getSupabaseServerClient()
    .rpc('team_lender_rooms', { account_id: teamId })
    .throwOnError();

  return (
    <LenderTeamRooms
      teamPath={teamPath}
      rows={await withLogoUrls(teamRooms(data))}
    />
  );
}

export async function LenderTeamContactsPage({
  teamId,
  teamPath,
}: {
  teamId: string;
  teamPath: string;
}) {
  const { data } = await getSupabaseServerClient()
    .rpc('team_lender_contacts', { account_id: teamId })
    .throwOnError();

  return (
    <LenderTeamContacts
      teamPath={teamPath}
      rows={await withLogoUrls(teamContacts(data))}
    />
  );
}
