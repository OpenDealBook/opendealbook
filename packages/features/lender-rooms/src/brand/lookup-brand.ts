import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import { parseBrandHost } from './domain';
import { readSite, type SiteAccess } from './read-site';

export interface LenderBrand {
  domain: string;
  name: string | null;
  logoPath: string | null;
}

export const BRAND_BUCKET = 'lender-brand';

export function brandLogoPath(domain: string): string {
  return `${domain}/logo`;
}

function brandOf(
  domain: string,
  name: string | null,
  logoPath: string | null,
): LenderBrand | null {
  return name || logoPath ? { domain, name, logoPath } : null;
}

export async function lookupBrand(
  url: string,
  site: SiteAccess,
): Promise<LenderBrand | null> {
  const parsed = parseBrandHost(url);

  if (!parsed) {
    return null;
  }

  const { host, domain } = parsed;
  const admin = getSupabaseServerAdminClient();

  const { data: cached } = await admin
    .from('lender_brand')
    .select('name, logo_path')
    .eq('domain', domain)
    .maybeSingle()
    .throwOnError();

  if (cached) {
    return brandOf(domain, cached.name, cached.logo_path);
  }

  const found = await readSite(host, site);
  const name = found?.name ?? null;
  let logoPath: string | null = null;

  if (found?.icon) {
    logoPath = brandLogoPath(domain);

    const { error } = await admin.storage
      .from(BRAND_BUCKET)
      .upload(logoPath, found.icon.bytes, {
        contentType: found.icon.contentType,
        upsert: true,
      });

    if (error) {
      throw error;
    }
  }

  await admin
    .from('lender_brand')
    .upsert({
      domain,
      name,
      logo_path: logoPath,
      fetched_at: new Date().toISOString(),
    })
    .throwOnError();

  return brandOf(domain, name, logoPath);
}
