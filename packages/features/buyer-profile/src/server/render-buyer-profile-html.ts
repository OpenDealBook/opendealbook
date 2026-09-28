import type { Json, Tables } from '@odb/supabase';

export type BuyerProfile = Tables<'buyer_profile'>;

// Boundary note: the caller sets includeSensitive only after its own
// permission check; this package renders and does not perform authorization.
export type RenderBuyerProfileOptions = {
  includeSensitive?: boolean;
};

const TEXT_SECTIONS: ReadonlyArray<readonly [keyof BuyerProfile, string]> = [
  ['about', 'About'],
  ['experience', 'Experience'],
  ['motivation', 'Motivation'],
  ['target_statement', 'Target'],
  ['value_proposition', 'Value Proposition'],
  ['photo_path', 'Photo'],
];

const JSON_SECTIONS: ReadonlyArray<readonly [keyof BuyerProfile, string]> = [
  ['expertise_json', 'Expertise'],
  ['financing_json', 'Financing'],
  ['contact_json', 'Contact'],
  ['interested_json', 'Interested'],
  ['not_interested_json', 'Not Interested'],
];

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function renderTextSection(label: string, value: string): string {
  return `<section><h2>${label}</h2><p>${escapeHtml(value)}</p></section>`;
}

function renderJsonSection(label: string, value: Json): string {
  return `<section><h2>${label}</h2><pre>${escapeHtml(
    JSON.stringify(value, null, 2),
  )}</pre></section>`;
}

export function renderBuyerProfileHtml(
  profile: BuyerProfile,
  options: RenderBuyerProfileOptions = {},
): string {
  if (profile.display_name === null) {
    throw new Error('buyer profile display_name is required');
  }

  const title = escapeHtml(profile.display_name);

  const headline = profile.headline
    ? `<p class="headline">${escapeHtml(profile.headline)}</p>`
    : '';

  const textSections = TEXT_SECTIONS.filter(([field]) => profile[field])
    .map(([field, label]) => renderTextSection(label, String(profile[field])))
    .join('');

  const jsonSections = JSON_SECTIONS.filter(([field]) => profile[field] != null)
    .map(([field, label]) => renderJsonSection(label, profile[field] as Json))
    .join('');

  const sensitive =
    options.includeSensitive === true &&
    profile.include_sensitive &&
    profile.sensitive_json != null
      ? renderJsonSection('Sensitive', profile.sensitive_json)
      : '';

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body><h1>${title}</h1>${headline}${textSections}${jsonSections}${sensitive}</body></html>`;
}
