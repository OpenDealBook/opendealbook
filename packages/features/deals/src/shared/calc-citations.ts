import type { getSupabaseBrowserClient } from '@odb/supabase/client';

import type { CitationLocator } from '../schema/calc-citation.schema';

type Client = ReturnType<typeof getSupabaseBrowserClient>;

type LocatorKind = CitationLocator['kind'];

export interface CalcCitation {
  id: string;
  rowId: string | null;
  inputKey: string;
  documentId: string;
  documentName: string;
  documentVersion: number;
  locator: CitationLocator;
  cell: string | null;
  newerVersionUploaded: boolean;
  documentRemoved: boolean;
}

export interface CitableDocument {
  id: string;
  name: string;
  version: number;
  locator: LocatorKind;
  latest: boolean;
}

export interface CalcSources {
  calcVersionId: string;
  dealId: string;
  canEdit: boolean;
  citations: CalcCitation[];
  documents: CitableDocument[];
}

const LOCATOR_BY_EXTENSION: Record<string, LocatorKind> = {
  pdf: 'page',
  doc: 'page',
  docx: 'page',
  ppt: 'page',
  pptx: 'page',
  xlsx: 'sheet',
  xls: 'sheet',
  csv: 'sheet',
};

function citationLocatorKind(fileName: string): LocatorKind {
  const extension = /\.([^.]+)$/.exec(fileName)?.[1]?.toLowerCase() ?? '';
  return LOCATOR_BY_EXTENSION[extension] ?? 'document';
}

function locatorOf(row: { page: number; sheet: string }): CitationLocator {
  if (row.sheet) {
    return { kind: 'sheet', sheet: row.sheet };
  }
  return row.page ? { kind: 'page', page: row.page } : { kind: 'document' };
}

export async function fetchCalcSources(
  client: Client,
  version: { id: string; deal_id: string },
): Promise<CalcSources> {
  const [citations, canEdit, documents] = await Promise.all([
    client
      .rpc('calc_input_citations', { calc_version_id: version.id })
      .throwOnError(),
    client
      .rpc('can_edit_calc_version', { calc_version_id: version.id })
      .throwOnError(),
    client
      .from('dr_document')
      .select('id, folder_id, name, version')
      .eq('deal_id', version.deal_id)
      .order('name')
      .order('version')
      .throwOnError(),
  ]);

  return {
    calcVersionId: version.id,
    dealId: version.deal_id,
    canEdit: canEdit.data,
    citations: citations.data.map((row) => ({
      id: row.id,
      rowId: row.row_id,
      inputKey: row.input_key,
      documentId: row.dr_document_id,
      documentName: row.document_name,
      documentVersion: row.document_version,
      locator: locatorOf(row),
      cell: row.cell,
      newerVersionUploaded: row.newer_version_uploaded,
      documentRemoved: row.document_removed,
    })),
    documents: documents.data.map((document) => ({
      id: document.id,
      name: document.name,
      version: document.version,
      locator: citationLocatorKind(document.name),
      latest: !documents.data.some(
        (other) =>
          other.folder_id === document.folder_id &&
          other.name === document.name &&
          other.version > document.version,
      ),
    })),
  };
}
