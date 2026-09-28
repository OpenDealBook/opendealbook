import { handleMcpRequest } from '@odb/api/mcp-server';

export const runtime = 'nodejs';

export const GET = handleMcpRequest;
export const POST = handleMcpRequest;
export const DELETE = handleMcpRequest;
