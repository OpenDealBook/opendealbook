import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@odb/outreach-app/server', () => ({ enrollTargets: vi.fn() }));

import { EnrollForm } from './enroll-form';

function render() {
  return renderToStaticMarkup(
    <EnrollForm
      accountId={'team-1'}
      sequences={[{ id: 's-1', name: 'Cold touch' }]}
      firms={[
        {
          id: 'f-1',
          name: 'Found Plumbing',
          contacts: [
            { id: 'c-1', name: null, email: 'owner@found.test' },
            { id: 'c-2', name: 'Pat Owner', email: 'pat@found.test' },
          ],
        },
      ]}
    />,
  );
}

describe('EnrollForm', () => {
  it('names a contact found by email lookup by its email', () => {
    const html = render();

    expect(html).toContain('owner@found.test');
    expect(html).not.toContain('<span class="text-muted-foreground">owner@found.test</span>');
  });

  it('names a contact by name, with its email beside it', () => {
    expect(render()).toContain('Pat Owner<span class="text-muted-foreground">pat@found.test</span>');
  });
});
