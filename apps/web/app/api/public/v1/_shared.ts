import { authenticateReadRequest } from '@tuckin/api/auth';

interface ResolvedAccount {
  accountId?: string;
  response?: Response;
}

export async function resolveAccount(
  request: Request,
): Promise<ResolvedAccount> {
  const result = await authenticateReadRequest(
    request.headers.get('authorization'),
  );

  if ('error' in result) {
    return {
      response: Response.json(
        { error: result.error },
        { status: result.status },
      ),
    };
  }

  return { accountId: result.accountId };
}

export function parseListParams(request: Request): {
  limit?: number;
  cursor?: string;
} {
  const params = new URL(request.url).searchParams;
  const limit = params.get('limit');

  return {
    limit: limit ? Number(limit) : undefined,
    cursor: params.get('cursor') ?? undefined,
  };
}
