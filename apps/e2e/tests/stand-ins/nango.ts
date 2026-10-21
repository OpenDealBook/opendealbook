import { notFound, type Handler } from './http';

export interface ProxyCall {
  method: string;
  endpoint: string;
  connectionId: string;
  providerConfigKey: string;
  query: Record<string, string>;
  body: string;
}

interface ProxyReply {
  connectionId: string;
  method: string;
  endpoint: string;
  status: number;
  body: unknown;
}

function replyKey({
  connectionId,
  method,
  endpoint,
}: Pick<ProxyCall, 'connectionId' | 'method' | 'endpoint'>) {
  return `${connectionId} ${method.toUpperCase()} ${endpoint}`;
}

export function nangoStandIn(): Handler {
  const connectSessions: unknown[] = [];
  const calls: ProxyCall[] = [];
  const replies = new Map<string, ProxyReply>();

  return (request) => {
    if (request.method === 'POST' && request.path === '/connect/sessions') {
      connectSessions.push(JSON.parse(request.body));
      return {
        status: 201,
        json: {
          data: {
            token: `nango_connect_session_e2e_${connectSessions.length}`,
            expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
          },
        },
      };
    }

    if (request.method === 'GET' && request.path.startsWith('/connections/')) {
      return {
        status: 200,
        json: {
          connection_id: request.path.slice('/connections/'.length),
          provider_config_key: request.query.get('provider_config_key'),
          credentials: {
            type: 'OAUTH2',
            access_token: 'nango-e2e-access-token',
          },
        },
      };
    }

    if (request.path.startsWith('/proxy/')) {
      const call: ProxyCall = {
        method: request.method,
        endpoint: request.path.slice('/proxy'.length),
        connectionId: String(request.headers['connection-id']),
        providerConfigKey: String(request.headers['provider-config-key']),
        query: Object.fromEntries(request.query),
        body: request.body,
      };
      calls.push(call);
      const reply = replies.get(replyKey(call));

      if (!reply) {
        return notFound(request, `no proxy reply set for ${replyKey(call)}`);
      }

      return { status: reply.status, json: reply.body };
    }

    if (request.method === 'PUT' && request.path === '/__e2e/proxy-replies') {
      const reply: ProxyReply = JSON.parse(request.body);
      replies.set(replyKey(reply), reply);
      return { status: 204, json: null };
    }

    if (request.method === 'GET' && request.path === '/__e2e/proxy-calls') {
      const connectionId = request.query.get('connectionId');
      return {
        status: 200,
        json: calls.filter((call) => call.connectionId === connectionId),
      };
    }

    if (
      request.method === 'GET' &&
      request.path === '/__e2e/connect-sessions'
    ) {
      return { status: 200, json: connectSessions };
    }

    return notFound(request);
  };
}
