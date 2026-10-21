import { SAMPLE_DEALS_NOT_LOADED, seedSampleDealsOnce } from '@odb/seed';
import { getLogger } from '@odb/shared/logger';

export async function ensureSampleDeals(team: {
  accountId: string;
  userId: string;
}): Promise<string | null> {
  try {
    await seedSampleDealsOnce(team);
    return null;
  } catch (error) {
    getLogger().error(
      { err: error, accountId: team.accountId },
      'Failed to seed sample deals',
    );
    return SAMPLE_DEALS_NOT_LOADED;
  }
}
