import { z } from 'zod';

import type { LenderRoomSummary } from '../members/entry-rules';
import { teamName } from '../requests-ui/wording';

export interface LoanAsk {
  amount: number | null;
  type: string | null;
  sellerNote: number | null;
  termYears: number | null;
}

interface HeaderFacts {
  lenderName: string;
  initials: string;
  logoPath: string | null;
  dealName: string | null;
  buyerTeam: string | null;
  loan: LoanAsk | null;
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
    loan: loan(room),
    closeBy: room.must_close_by ?? room.target_close_date,
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

function loan(room: LenderRoomSummary): LoanAsk | null {
  const ask = {
    amount: room.loan_amount,
    type: room.loan_type,
    sellerNote: room.seller_note_amount,
    termYears: room.term_years,
  };

  return Object.values(ask).every((value) => value === null) ? null : ask;
}

export function loanAskParts<T>(
  loan: LoanAsk,
  money: (amount: number) => T,
): (string | T)[] {
  const typeLabel = loan.type === null ? undefined : LOAN_TYPES[loan.type];
  const phrase = [
    loan.amount === null ? [] : [money(loan.amount)],
    typeLabel === undefined ? [] : [typeLabel],
    loan.sellerNote === null
      ? []
      : ['plus ', money(loan.sellerNote), ' seller note'],
  ]
    .filter((words) => words.length > 0)
    .flatMap((words, index) => (index === 0 ? words : [' ', ...words]));
  const term = loan.termYears === null ? [] : [`${loan.termYears}-year term`];

  return phrase.length > 0 && term.length > 0
    ? [...phrase, ', ', ...term]
    : [...phrase, ...term];
}

export function longDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
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
