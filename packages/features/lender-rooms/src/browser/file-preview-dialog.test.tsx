// @vitest-environment jsdom
import { act } from 'react';

import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

vi.mock('../viewer/file-viewer', () => ({
  FileViewer: (viewer: { fileName: string; previewUrl: string }) => (
    <p data-preview-url>{viewer.previewUrl}</p>
  ),
}));

import { FilePreviewDialog } from './file-preview-dialog';

const ROOM = '7d0f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11';

it('previews one document by id through the tracked route and closes', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

  const container = document.createElement('div');
  const root = createRoot(container);
  let closed = 0;

  document.body.append(container);
  act(() =>
    root.render(
      <FilePreviewDialog
        roomId={ROOM}
        documentId={'doc-1'}
        fileName={'Lease.pdf'}
        onClose={() => {
          closed += 1;
        }}
      />,
    ),
  );

  expect(document.querySelector('[data-preview-url]')!.textContent).toBe(
    `/lender/${ROOM}/files/doc-1?disposition=preview`,
  );
  expect(document.querySelector('[role=dialog] h2')!.textContent).toBe(
    'Preview of Lease.pdf',
  );

  await act(async () => {
    [...document.querySelectorAll('button')]
      .find((button) => button.textContent === 'Close')!
      .click();
  });

  expect(closed).toBe(1);

  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('previews a lender package document through the deal team route', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

  const container = document.createElement('div');
  const root = createRoot(container);

  document.body.append(container);
  act(() =>
    root.render(
      <FilePreviewDialog
        accountSlug={'harbor-capital'}
        dealId={'deal-1'}
        documentId={'doc-1'}
        fileName={'Lease.pdf'}
        onClose={() => {}}
      />,
    ),
  );

  expect(document.querySelector('[data-preview-url]')!.textContent).toBe(
    '/home/harbor-capital/deals/deal-1/lenders/package/files/doc-1?disposition=preview',
  );

  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
