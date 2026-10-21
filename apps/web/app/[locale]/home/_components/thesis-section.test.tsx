import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {} }) }));
vi.mock('@odb/deals/server', () => ({ upsertDealThesis: vi.fn() }));

import { ThesisSection } from './thesis-section';

describe('ThesisSection', () => {
  it('invites a first thesis without calling it broker-facing', () => {
    const html = renderToStaticMarkup(
      <ThesisSection deal_id={'deal-1'} thesis={null} />,
    );

    expect(html).toContain(
      'No thesis yet. Write down why you want this business, what worries you, and your plan after closing.',
    );
    expect(html).not.toContain('broker-facing');
  });
});
