import { notFound, type Handler } from './http';

export function licenseRegistryStandIn(): Handler {
  return (request) => {
    if (request.path === '/api/') {
      return { status: 200, json: { results: [] } };
    }
    if (request.path.startsWith('/resource/')) {
      return { status: 200, json: [] };
    }
    return notFound(request);
  };
}
