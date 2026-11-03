export interface CitedDocument {
  documentId: string;
  documentName: string;
  version: number;
}

export type DocumentCitation = CitedDocument &
  ({ pageFrom: number; pageTo: number } | { sheet: string; cellRange: string });

export function citationLabel(citation: DocumentCitation): string {
  const document = `${citation.documentName} v${citation.version}`;
  if ('sheet' in citation) {
    return `${document}, ${citation.sheet}!${citation.cellRange}`;
  }
  const pages =
    citation.pageFrom === citation.pageTo
      ? `${citation.pageFrom}`
      : `${citation.pageFrom}-${citation.pageTo}`;
  return `${document}, p. ${pages}`;
}
