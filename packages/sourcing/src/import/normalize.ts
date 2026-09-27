export function normalizeText(value: string | undefined): string | null {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

export function normalizeInteger(value: string | undefined): number | null {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  const parsed = Number.parseInt(trimmed, 10);

  return Number.isNaN(parsed) ? null : parsed;
}

export function websiteKey(website: string | null): string | null {
  if (!website) {
    return null;
  }

  const stripped = website
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '');

  return stripped ? stripped : null;
}

export function phoneKey(phone: string | null): string | null {
  if (!phone) {
    return null;
  }

  const digits = phone.replace(/\D/g, '');

  return digits ? digits : null;
}
