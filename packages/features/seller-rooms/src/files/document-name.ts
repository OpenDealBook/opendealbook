const UNSAFE = /[/\\\p{Cc}\p{Cf}]/gu;

function usable(name: string | null): string | null {
  const cleaned = name?.replace(UNSAFE, '') ?? '';

  return cleaned.trim() === '' ? null : cleaned;
}

export function sellerAttachmentName(
  templateName: string | null,
  firmName: string | null,
): string {
  const template = usable(templateName);

  if (template === null) {
    return 'Document.pdf';
  }

  const firm = usable(firmName);

  return firm === null ? `${template}.pdf` : `${template} - ${firm}.pdf`;
}
