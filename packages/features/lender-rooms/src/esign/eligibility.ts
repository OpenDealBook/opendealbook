import type { Enums } from '@odb/supabase';

const PDF = /\.pdf$/i;
const WORD = /\.docx?$/i;

export function signableKind(fileName: string): 'pdf' | 'word' | null {
  if (PDF.test(fileName)) {
    return 'pdf';
  }

  return WORD.test(fileName) ? 'word' : null;
}

export const IN_PROGRESS =
  'This form already has a signature request in progress';

export function signatureRequestRefusal(form: {
  returnRoute: Enums<'lender_return_route'> | null;
  blankFormName: string;
  signatureStatuses: readonly Enums<'lender_signature_status'>[];
  formStatus: Enums<'lender_ask_status'>;
  isRoomOpen: boolean;
}): string | null {
  if (!form.isRoomOpen) {
    return 'This lender room is closed, so a signature cannot be requested for its forms';
  }

  if (form.formStatus === 'withdrawn' || form.formStatus === 'closed') {
    return `This form is ${form.formStatus}, so a signature cannot be requested for it`;
  }

  if (form.returnRoute !== 'esign') {
    return 'The lender wants this form back as an uploaded file, not by e-signature';
  }

  if (signableKind(form.blankFormName) === null) {
    return 'Only PDF and Word files can be signed. Request a PDF or Word file from the lender';
  }

  return form.signatureStatuses.some(
    (status) => status === 'draft' || status === 'sent',
  )
    ? IN_PROGRESS
    : null;
}
