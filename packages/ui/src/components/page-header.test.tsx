import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PageHeader, PageTitle } from './page-header';

describe('PageHeader', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it('titles the page with its one level-one heading', () => {
    act(() => root.render(<PageHeader title={'Deals'} />));

    const headings = container.querySelectorAll('h1, [role="heading"]');
    expect([...headings].map((heading) => heading.textContent)).toEqual([
      'Deals',
    ]);
    expect(headings[0]!.tagName).toBe('H1');
  });

  it('shows the eyebrow, description and actions alongside the title', () => {
    act(() =>
      root.render(
        <PageHeader
          eyebrow={<a href={'/rooms'}>Back to the room</a>}
          title={'Contracts'}
          description={'Every contract on this deal.'}
          actions={<button type={'button'}>New contract</button>}
        />,
      ),
    );

    const header = container.querySelector('header')!;
    expect(header.querySelector('h1')!.textContent).toBe('Contracts');
    expect(header.querySelector('a[href="/rooms"]')!.textContent).toBe(
      'Back to the room',
    );
    expect(header.textContent).toContain('Every contract on this deal.');
    expect(header.querySelector('button')!.textContent).toBe('New contract');
  });

  it('titles a deal tab one level below the deal name', () => {
    act(() => root.render(<PageHeader level={2} title={'Meetings'} />));

    expect(container.querySelector('h1')).toBeNull();
    expect(container.querySelector('h2')!.textContent).toBe('Meetings');
  });

  it('lets the title serve as a focus target', () => {
    act(() =>
      root.render(
        <PageHeader
          title={'Tax returns'}
          titleProps={{ id: 'request-title', tabIndex: -1 }}
        />,
      ),
    );

    act(() => document.getElementById('request-title')!.focus());

    expect(document.activeElement!.tagName).toBe('H1');
    expect(document.activeElement!.textContent).toBe('Tax returns');
  });

  it('heads a custom layout at the page level by default and a tab level on request', () => {
    act(() =>
      root.render(
        <>
          <PageTitle>Dockside Marina</PageTitle>
          <PageTitle level={2}>Bluefin Test Lending</PageTitle>
        </>,
      ),
    );

    expect(
      [...container.querySelectorAll('h1, h2')].map((heading) => [
        heading.tagName,
        heading.textContent,
      ]),
    ).toEqual([
      ['H1', 'Dockside Marina'],
      ['H2', 'Bluefin Test Lending'],
    ]);
  });
});
