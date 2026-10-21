import { z } from 'zod';

import type { LenderRoomSummary } from '../members/entry-rules';
import { teamName } from '../requests-ui/wording';

interface HeaderFacts {
  lenderName: string;
  initials: string;
  logoPath: string | null;
  dealName: string | null;
  buyerTeam: string | null;
  loanAsk: string | null;
  closeBy: string | null;
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
    buyerTeam: room.buyer_team,
    loanAsk: loanAsk(room),
    closeBy: closeBy(room),
    welcomeNote: room.welcome_note,
    accessEnds: room.expires_at,
    packageLabel: room.deal_name
      ? `${room.deal_name} lender package`
      : 'Lender package',
    recordedFor: teamName(room.deal_name),
  };
}

const LOAN_TYPES: Record<string, string> = {
  sba_7a: 'SBA 7(a)',
  sba_504: 'SBA 504',
  conventional: 'Conventional',
  seller_financing: 'Seller financing',
  cash_equity: 'Cash equity',
  heloc: 'HELOC',
  robs_401k: 'ROBS 401(k)',
  investor_equity: 'Investor equity',
  mezzanine: 'Mezzanine',
  other: 'Other',
};

const dollars = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

function loanAsk(room: LenderRoomSummary): string | null {
  const loan = [
    room.loan_amount === null ? null : dollars.format(room.loan_amount),
    room.loan_type === null ? null : LOAN_TYPES[room.loan_type],
    room.seller_note_amount === null
      ? null
      : `plus ${dollars.format(room.seller_note_amount)} seller note`,
  ]
    .filter((part) => part !== null)
    .join(' ');
  const term =
    room.term_years === null ? null : `${room.term_years}-year term`;

  return [loan || null, term].filter((part) => part !== null).join(', ') || null;
}

export function longDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function closeBy(room: LenderRoomSummary): string | null {
  const date = room.must_close_by ?? room.target_close_date;

  return date === null ? null : longDate(date);
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
