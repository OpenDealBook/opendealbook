import { notFound, type Handler } from './http';

const BUSINESS_ID = 'md-biz-larkspur';

const ORDERS = [
  'business_verification_verify',
  'litigations',
  'liens',
  'bankruptcies',
].map((product) => ({
  product,
  status: 'completed',
  completed_at: '2026-11-01T00:00:00Z',
}));

const THISTLEDOWN_UCC = {
  type: 'ucc',
  state: 'TX',
  status: 'open',
  filing_date: '2023-04-12',
  file_number: 'TX-UCC-0000417',
  secured_parties: [{ name: 'Thistledown Equipment Credit' }],
};

const page = (data: unknown[]) => ({
  status: 200,
  json: { data, has_more: false },
});

export function middeskStandIn(): Handler {
  return (request) => {
    const route = `${request.method} ${request.path}`;
    if (route === 'GET /businesses') {
      return page([]);
    }
    if (route === 'POST /businesses') {
      return { status: 200, json: { id: BUSINESS_ID } };
    }
    if (route === `GET /businesses/${BUSINESS_ID}/orders`) {
      return page(ORDERS);
    }
    if (route === `GET /businesses/${BUSINESS_ID}/liens`) {
      return page([THISTLEDOWN_UCC]);
    }
    if (
      route === `GET /businesses/${BUSINESS_ID}/litigations` ||
      route === `GET /businesses/${BUSINESS_ID}/bankruptcies`
    ) {
      return page([]);
    }
    return notFound(request);
  };
}
