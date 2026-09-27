import { phoneKey, websiteKey } from './normalize';
import type { ExistingFirmKey, NormalizedFirmRow } from './types';

export function dedupeFirms(
  rows: NormalizedFirmRow[],
  existing: ExistingFirmKey[],
): NormalizedFirmRow[] {
  const seenWebsites = new Set<string>();
  const seenPhones = new Set<string>();

  for (const key of existing) {
    const website = websiteKey(key.website);
    const phone = phoneKey(key.phone);

    if (website) {
      seenWebsites.add(website);
    }

    if (phone) {
      seenPhones.add(phone);
    }
  }

  const kept: NormalizedFirmRow[] = [];

  for (const row of rows) {
    const website = websiteKey(row.website);
    const phone = phoneKey(row.phone);
    const websiteHit = website !== null && seenWebsites.has(website);
    const phoneHit = phone !== null && seenPhones.has(phone);

    if (websiteHit || phoneHit) {
      continue;
    }

    kept.push(row);

    if (website) {
      seenWebsites.add(website);
    }

    if (phone) {
      seenPhones.add(phone);
    }
  }

  return kept;
}
