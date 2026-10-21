import type { getSupabaseServerClient } from '@odb/supabase/server';

export interface LandingTeam {
  id: string;
  name: string;
  slug: string;
}

export type TeamLanding =
  | { kind: 'go'; path: string }
  | { kind: 'pick'; teams: LandingTeam[] };

export function chooseTeamLanding(
  teams: LandingTeam[],
  lastTeamId: string | null,
): TeamLanding {
  const last = teams.find((team) => team.id === lastTeamId);

  if (last) {
    return { kind: 'go', path: `/home/${last.slug}` };
  }

  if (teams.length === 0) {
    return { kind: 'go', path: '/home/create-team' };
  }

  if (teams.length === 1) {
    return { kind: 'go', path: `/home/${teams[0]!.slug}` };
  }

  return { kind: 'pick', teams };
}

export async function resolveTeamLanding(
  client: ReturnType<typeof getSupabaseServerClient>,
  userId: string,
): Promise<TeamLanding> {
  const [{ data: teams }, { data: personal }] = await Promise.all([
    client
      .from('accounts')
      .select('id, name, slug, accounts_memberships!inner(user_id)')
      .eq('accounts_memberships.user_id', userId)
      .eq('is_personal_account', false)
      .order('name')
      .throwOnError(),
    client
      .from('accounts')
      .select('last_team_account_id')
      .eq('primary_owner_user_id', userId)
      .eq('is_personal_account', true)
      .single()
      .throwOnError(),
  ]);

  return chooseTeamLanding(
    teams.map(({ id, name, slug }) => ({ id, name, slug: slug! })),
    personal.last_team_account_id,
  );
}
