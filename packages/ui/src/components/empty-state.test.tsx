import { FolderOpen } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { EmptyState } from './empty-state';
import { PageTitle } from './page-header';

function render(node: React.ReactNode) {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(node);
  return host;
}

describe('EmptyState', () => {
  it('names what is missing, says why it matters and offers the next action', () => {
    const host = render(
      <EmptyState
        icon={FolderOpen}
        title={'No deals yet'}
        description={'Add the first business you are looking at.'}
        action={<a href={'/home/acme/deals/new'}>New deal</a>}
      />,
    );

    expect(host.querySelector('h2')!.textContent).toBe('No deals yet');
    expect(host.textContent).toContain(
      'Add the first business you are looking at.',
    );
    expect(
      host.querySelector('a[href="/home/acme/deals/new"]')!.textContent,
    ).toBe('New deal');
    expect(host.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('sets its title in the same serif as a level-two page title', () => {
    const host = render(
      <>
        <EmptyState title={'No lender rooms yet'} description={'Rooms.'} />
        <PageTitle level={2}>Lenders</PageTitle>
      </>,
    );

    const [emptyTitle, pageTitle] = host.querySelectorAll('h2');
    expect(emptyTitle!.className).toBe(pageTitle!.className);
    expect(host.querySelector('svg')).toBeNull();
  });
});
