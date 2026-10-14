import { z } from 'zod';

import type { LenderRoomSummary } from '../members/entry-rules';
import { teamName } from '../requests-ui/wording';

interface HeaderFacts {
  lenderName: string;
  initials: string;
  logoPath: string | null;
  dealName: string | null;
  dealDescription: string | null;
  welcomeNote: string | null;
  accessEnds: string | null;
  packageLabel: string;
  recordedFor: string;
}

export function headerFacts(room: LenderRoomSummary): HeaderFacts {
  const lenderName = z.string().parse(room.name);

  return {
    lenderName,
    initials: lenderName
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word.charAt(0).toUpperCase())
      .join(''),
    logoPath: room.brand_logo_path,
    dealName: room.deal_name,
    dealDescription: room.deal_description,
    welcomeNote: room.welcome_note,
    accessEnds: room.expires_at,
    packageLabel: room.deal_name
      ? `${room.deal_name} lender package`
      : 'Lender package',
    recordedFor: teamName(room.deal_name),
  };
}

interface ContactFacts {
  name: string;
  photoPath: string | null;
  email: string;
  phone: string | null;
}

const profileWithContact = z.object({
  display_name: z.string(),
  photo_path: z.string().nullable(),
  contact_json: z.object({ email: z.email(), phone: z.string() }),
});

export function contactFacts(profile: unknown): ContactFacts | null {
  const parsed = profileWithContact.safeParse(profile);

  return parsed.success
    ? {
        name: parsed.data.display_name,
        photoPath: parsed.data.photo_path,
        email: parsed.data.contact_json.email,
        phone: parsed.data.contact_json.phone || null,
      }
    : null;
}
