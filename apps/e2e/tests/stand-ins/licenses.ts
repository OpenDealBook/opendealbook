import { notFound, type Handler } from './http';

const TEXAS_TDLR = '/resource/7358-krk7.json';

const QUILLFEATHER_LICENSE = {
  business_name: 'Quillfeather Mechanical',
  license_number: 'TACLA00000001E',
  license_type: 'A/C Contractor',
  license_expiration_date_mmddccyy: '06/30/2027',
};

export function licenseRegistryStandIn(): Handler {
  return (request) => {
    if (request.path === '/api/') {
      return { status: 200, json: { results: [] } };
    }
    if (
      request.path === TEXAS_TDLR &&
      request.query.get('$where')?.includes('%QUILLFEATHER%')
    ) {
      return { status: 200, json: [QUILLFEATHER_LICENSE] };
    }
    if (request.path.startsWith('/resource/')) {
      return { status: 200, json: [] };
    }
    return notFound(request);
  };
}
