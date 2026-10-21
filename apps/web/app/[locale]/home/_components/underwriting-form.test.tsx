import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@odb/deals/server', () => ({ upsertDealBox: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {} }) }));

import { UnderwritingForm } from './underwriting-form';

function render(canManage: boolean) {
  return renderToStaticMarkup(
    <UnderwritingForm
      accountId={'acc-1'}
      criteria={{}}
      brokerSummary={null}
      minDscr={1.5}
      requiredPersonalCashFlow={180000}
      canManage={canManage}
    />,
  );
}

describe('UnderwritingForm', () => {
  it('lets a deal manager save the thresholds', () => {
    const html = render(true);

    expect(html).toContain('Deal box thresholds');
    expect(html).not.toContain('<fieldset disabled=""');
  });

  it('shows anyone else the thresholds locked with the reason', () => {
    const html = render(false);

    expect(html).toContain('Only deal managers can change the deal box.');
    expect(html).toMatch(/<fieldset disabled=""[^]*Required DSCR[^]*>Save</);
  });
});
