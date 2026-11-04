export interface CitedDocument {
  documentId: string;
  documentName: string;
  version: number;
}

export type DocumentCitation = CitedDocument & { excerpt?: string } & (
    | { pageFrom: number; pageTo: number }
    | { sheet: string; cellRange: string }
  );

export function citationRange(citation: DocumentCitation): string {
  if ('sheet' in citation) {
    return `${citation.sheet}!${citation.cellRange}`;
  }
  return citation.pageFrom === citation.pageTo
    ? `p. ${citation.pageFrom}`
    : `p. ${citation.pageFrom}-${citation.pageTo}`;
}

export function citationLabel(citation: DocumentCitation): string {
  return `${citation.documentName} v${citation.version}, ${citationRange(citation)}`;
}
