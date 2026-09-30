import type { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import type {
  GatherContext,
  PayrollTaxVsW2Input,
  ReconciliationCheck,
  ReconciliationLinks,
  RevenueVsDdFinancialsInput,
  RunnableCheck,
} from '@odb/verification';
import { payrollTaxVsW2Check, revenueVsDdFinancialsCheck } from '@odb/verification';

import type { DoclingConfig } from './docling';
import { extractMarkdown } from './docling';
import type { ExtractionEndpoint } from './extraction';
import { extractFigure } from './extraction';

const DATA_ROOM_BUCKET = 'data-room';
const SIGNED_URL_TTL_SECONDS = 3600;

// Assumption pending human confirmation: documents are matched to a check side
// by keyword against the document name and its linked checklist_item
// category/title. Rerun with tuned patterns once the human confirms the intake
// taxonomy.
const DOCUMENT_SELECTORS = {
  w2Wages: /\bw-?2\b/i,
  payrollTaxWages: /\b941\b|payroll tax/i,
  ddFinancialsRevenue:
    /due diligence financ|dd financ|financial statement|income statement|profit and loss|\bp&l\b/i,
  marketingRevenue: /marketing|\bcim\b|teaser|offering memorandum|confidential information/i,
};

// Assumption pending CPA-domain ruling: which line/box each figure maps to and
// the reporting period. Defaults below are annual; the extraction prompt states
// them explicitly so a reviewer can confirm or override.
const FIGURE_INSTRUCTIONS = {
  w2Wages:
    'Extract the total of Box 1 (wages, tips, other compensation) across every W-2 in this document, as an annual figure.',
  payrollTaxWages:
    'Extract Form 941 line 2 (wages, tips, and other compensation). If the document is a single quarter, report that quarter; annual totals are summed across the four quarterly filings.',
  ddFinancialsRevenue:
    'Extract total annual revenue (top-line net revenue) reported in these due-diligence financial statements.',
  marketingRevenue:
    'Extract total annual revenue as stated in the marketing materials for the business.',
};

type Client = ReturnType<typeof getSupabaseServerAdminClient>;

interface DealDocument {
  id: string;
  name: string;
  storagePath: string;
  checklistItemId: string | null;
  category: string | null;
  title: string | null;
}

interface SideResult {
  total: number | null;
  links: ReconciliationLinks;
}

export interface DocumentExtractionGatherDeps {
  client: Client;
  dealId: string;
  docling: DoclingConfig;
}

export async function buildDocumentExtractionChecks(
  deps: DocumentExtractionGatherDeps,
): Promise<RunnableCheck<unknown>[]> {
  const { client, dealId, docling } = deps;

  const { data: deal, error: dealError } = await client
    .from('deal')
    .select('account_id')
    .eq('id', dealId)
    .single();

  if (dealError) {
    throw dealError;
  }

  const accountId = deal.account_id;

  const { data: endpointRow, error: endpointError } = await client
    .from('llm_endpoint')
    .select('id, chat_model, base_url, api_key_secret_ref')
    .eq('account_id', accountId)
    .limit(1)
    .single();

  if (endpointError) {
    throw endpointError;
  }

  const endpoint: ExtractionEndpoint = {
    baseUrl: endpointRow.base_url!,
    chatModel: endpointRow.chat_model!,
    apiKey: process.env[endpointRow.api_key_secret_ref!]!,
  };

  const documents = await loadDealDocuments(client, dealId);

  const context = {
    client,
    accountId,
    dealId,
    docling,
    endpoint,
    endpointId: endpointRow.id,
    documents,
  };

  return [
    {
      check: payrollTaxVsW2Check as ReconciliationCheck<unknown>,
      gather: async (ctx: GatherContext) => {
        const w2 = await resolveSide(context, DOCUMENT_SELECTORS.w2Wages, FIGURE_INSTRUCTIONS.w2Wages);
        const payroll = await resolveSide(
          context,
          DOCUMENT_SELECTORS.payrollTaxWages,
          FIGURE_INSTRUCTIONS.payrollTaxWages,
        );

        return {
          period: ctx.period,
          w2WagesTotal: w2.total,
          payrollTaxWagesTotal: payroll.total,
          links: w2.links.drDocumentId ? w2.links : payroll.links,
        } satisfies PayrollTaxVsW2Input;
      },
    },
    {
      check: revenueVsDdFinancialsCheck as ReconciliationCheck<unknown>,
      gather: async (ctx: GatherContext) => {
        const marketing = await resolveSide(
          context,
          DOCUMENT_SELECTORS.marketingRevenue,
          FIGURE_INSTRUCTIONS.marketingRevenue,
        );
        const ddFinancials = await resolveSide(
          context,
          DOCUMENT_SELECTORS.ddFinancialsRevenue,
          FIGURE_INSTRUCTIONS.ddFinancialsRevenue,
        );

        return {
          period: ctx.period,
          marketingRevenue: marketing.total,
          ddFinancialsRevenue: ddFinancials.total,
          links: marketing.links.drDocumentId ? marketing.links : ddFinancials.links,
        } satisfies RevenueVsDdFinancialsInput;
      },
    },
  ];
}

async function loadDealDocuments(
  client: Client,
  dealId: string,
): Promise<DealDocument[]> {
  const { data: documents, error: documentsError } = await client
    .from('dr_document')
    .select('id, name, storage_path, checklist_item_id')
    .eq('deal_id', dealId)
    .is('removed_at', null);

  if (documentsError) {
    throw documentsError;
  }

  const { data: items, error: itemsError } = await client
    .from('checklist_item')
    .select('id, category, title')
    .eq('deal_id', dealId);

  if (itemsError) {
    throw itemsError;
  }

  const byId = new Map(items.map((item) => [item.id, item]));

  return documents.map((document) => {
    const item = document.checklist_item_id
      ? byId.get(document.checklist_item_id)
      : undefined;

    return {
      id: document.id,
      name: document.name,
      storagePath: document.storage_path,
      checklistItemId: document.checklist_item_id,
      category: item?.category ?? null,
      title: item?.title ?? null,
    };
  });
}

interface ResolveContext {
  client: Client;
  accountId: string;
  dealId: string;
  docling: DoclingConfig;
  endpoint: ExtractionEndpoint;
  endpointId: string;
  documents: DealDocument[];
}

async function resolveSide(
  context: ResolveContext,
  selector: RegExp,
  instruction: string,
): Promise<SideResult> {
  const matched = context.documents.filter((document) =>
    selector.test(`${document.name} ${document.category ?? ''} ${document.title ?? ''}`),
  );

  if (matched.length === 0) {
    return { total: null, links: {} };
  }

  const amounts: number[] = [];

  for (const document of matched) {
    const signedUrl = await signDocument(context.client, document.storagePath);
    const markdown = await extractMarkdown(context.docling, signedUrl);
    const figure = await extractFigure(context.endpoint, instruction, markdown);

    await context.client.from('ai_call_log').insert({
      account_id: context.accountId,
      deal_id: context.dealId,
      endpoint_id: context.endpointId,
      model: context.endpoint.chatModel,
      prompt_tokens: figure.promptTokens,
      completion_tokens: figure.completionTokens,
    });

    if (figure.amount !== null) {
      amounts.push(figure.amount);
    }
  }

  const first = matched[0]!;

  return {
    total: amounts.length > 0 ? amounts.reduce((sum, value) => sum + value, 0) : null,
    links: {
      drDocumentId: first.id,
      ...(first.checklistItemId ? { checklistItemId: first.checklistItemId } : {}),
    },
  };
}

async function signDocument(client: Client, storagePath: string): Promise<string> {
  const { data, error } = await client.storage
    .from(DATA_ROOM_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

  if (error) {
    throw error;
  }

  return data.signedUrl;
}
