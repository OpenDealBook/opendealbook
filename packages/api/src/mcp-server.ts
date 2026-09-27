import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { authenticateReadRequest } from './auth';
import {
  getDeal,
  getDealBox,
  listChecklistItems,
  listDeals,
  listFirms,
} from './queries';

function jsonResult(payload: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
  };
}

const listArgs = {
  limit: z.number().int().positive().optional(),
  cursor: z.string().optional(),
};

export function createMcpServer(accountId: string): McpServer {
  const server = new McpServer({ name: 'opendealbook', version: '0.1.0' });

  server.registerTool(
    'list_deals',
    {
      description: 'List deals for the authenticated account.',
      inputSchema: {
        ...listArgs,
        stage: z.string().optional(),
        source: z.string().optional(),
      },
    },
    async (args) => jsonResult(await listDeals(accountId, args)),
  );

  server.registerTool(
    'get_deal',
    {
      description: 'Fetch a single deal by id.',
      inputSchema: { id: z.string() },
    },
    async (args) => jsonResult(await getDeal(accountId, args.id)),
  );

  server.registerTool(
    'list_firms',
    {
      description: 'List firms for the authenticated account.',
      inputSchema: { ...listArgs, status: z.string().optional() },
    },
    async (args) => jsonResult(await listFirms(accountId, args)),
  );

  server.registerTool(
    'get_deal_box',
    {
      description: 'Fetch the current deal box for the authenticated account.',
    },
    async () => jsonResult(await getDealBox(accountId)),
  );

  server.registerTool(
    'list_checklist_items',
    {
      description: 'List checklist items for a deal.',
      inputSchema: { ...listArgs, deal_id: z.string() },
    },
    async (args) =>
      jsonResult(
        await listChecklistItems(accountId, args.deal_id, {
          limit: args.limit,
          cursor: args.cursor,
        }),
      ),
  );

  return server;
}

export async function handleMcpRequest(request: Request): Promise<Response> {
  const auth = await authenticateReadRequest(
    request.headers.get('authorization'),
  );

  if ('error' in auth) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const server = createMcpServer(auth.accountId);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  await server.connect(transport);

  return transport.handleRequest(request);
}
