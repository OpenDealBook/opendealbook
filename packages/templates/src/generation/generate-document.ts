import type { Tables, TablesInsert } from '@tuckin/supabase';

import {
  type TemplateStorage,
  generatedDocxPath,
  generatedPdfPath,
  templateDocxPath,
} from '../storage';
import type { DocxTemplateEngine } from '../superdoc';
import { convertDocxToPdf } from './convert-pdf';
import { type DealContext, resolveFieldValues } from './resolve-fields';

const DOCX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PDF_CONTENT_TYPE = 'application/pdf';

export interface LoadedTemplate {
  row: Tables<'document_template'>;
  fields: Tables<'template_field'>[];
}

export interface GenerateDocumentInput {
  template: LoadedTemplate;
  deal: DealContext;
  fieldValues: Record<string, unknown>;
}

export interface GenerateDocumentDeps {
  engine: DocxTemplateEngine;
  storage: TemplateStorage;
}

export async function generateDocument(
  input: GenerateDocumentInput,
  deps: GenerateDocumentDeps,
): Promise<TablesInsert<'generated_document'>> {
  const { row, fields } = input.template;
  const dealId = input.deal.deal.id;
  const { values, valuesJson } = resolveFieldValues(
    fields,
    input.deal,
    input.fieldValues,
  );

  const source = await deps.storage.downloadTemplate(
    templateDocxPath(row.account_id, row.id, row.version),
  );
  const filled = await deps.engine.fill(source, values);
  const pdf = await convertDocxToPdf(filled);

  const documentKey = crypto.randomUUID();
  const docxPath = generatedDocxPath(row.account_id, dealId, documentKey);
  const pdfPath = generatedPdfPath(row.account_id, dealId, documentKey);

  await deps.storage.uploadGenerated(docxPath, filled, DOCX_CONTENT_TYPE);
  await deps.storage.uploadGenerated(pdfPath, pdf, PDF_CONTENT_TYPE);

  return {
    account_id: row.account_id,
    template_id: row.id,
    template_version: row.version,
    deal_id: dealId,
    values_json:
      valuesJson as TablesInsert<'generated_document'>['values_json'],
    docx_path: docxPath,
    pdf_path: pdfPath,
    contract_id: null,
  };
}
