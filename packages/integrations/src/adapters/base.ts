import type { AdapterConfig, IntegrationAdapter, ProxyRequest } from './types';

export function createProxy({
  nango,
  connectionId,
  providerConfigKey,
}: AdapterConfig): IntegrationAdapter['proxy'] {
  return async function proxy<T>(request: ProxyRequest): Promise<T> {
    const response = await nango.proxy({
      method: request.method ?? 'GET',
      endpoint: request.endpoint,
      connectionId,
      providerConfigKey,
      params: request.params,
      data: request.data,
      headers: request.headers,
    });

    return response.data as T;
  };
}
