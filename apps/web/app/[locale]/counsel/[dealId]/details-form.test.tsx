// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const server = vi.hoisted(() => ({
  save: vi.fn(),
  skip: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('@odb/deal-counsel/profile.ts', () => ({
  setMyCounselDetails: server.save,
  skipCounselProfilePrompt: server.skip,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: server.refresh }),
}));

import { CounselDetailsForm, CounselDetailsMenu } from './details-form';

let container: HTMLDivElement;
let root: Root;

function renderForm() {
  act(() =>
    root.render(
      <CounselDetailsForm dealId={'deal-1'} name={'Team Typo'} phone={null} />,
    ),
  );
}

function renderMenu(prompt: boolean) {
  act(() =>
    root.render(
      <CounselDetailsMenu
        dealId={'deal-1'}
        name={'Team Typo'}
        phone={null}
        prompt={prompt}
      />,
    ),
  );
}

function button(label: string) {
  return [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === label,
  );
}

beforeEach(() => {
  server.save.mockReset();
  server.skip.mockReset();
  server.refresh.mockReset();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('CounselDetailsForm', () => {
  it('saves the name and phone and says Saved', async () => {
    server.save.mockResolvedValueOnce({ ok: true, value: undefined });
    renderForm();

    expect(container.textContent).not.toContain('Saved');

    await act(async () => {
      container.querySelector('form')!.requestSubmit();
    });

    expect(server.save).toHaveBeenCalledWith({
      dealId: 'deal-1',
      name: 'Team Typo',
      phone: '',
    });
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      'Saved',
    );
    expect(server.refresh).toHaveBeenCalled();
  });

  it('says why and does not claim Saved when the save is refused', async () => {
    server.save.mockResolvedValueOnce({
      ok: false,
      refusal: 'You are not counsel on this deal.',
    });
    renderForm();

    await act(async () => {
      container.querySelector('form')!.requestSubmit();
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'You are not counsel on this deal.',
    );
    expect(container.textContent).not.toContain('Saved');
  });
});

describe('CounselDetailsMenu', () => {
  it('asks for details without blocking and lets counsel skip', async () => {
    server.skip.mockResolvedValueOnce({ ok: true, value: undefined });
    renderMenu(true);

    expect(container.textContent).toContain(
      'Add a phone number so the deal team can reach you.',
    );
    expect(button('Your details')).toBeDefined();

    await act(async () => {
      button('Skip')!.click();
    });

    expect(server.skip).toHaveBeenCalledWith({ dealId: 'deal-1' });
    expect(server.refresh).toHaveBeenCalled();
  });

  it('is only a Your details item once counsel have answered', () => {
    renderMenu(false);

    expect(button('Your details')).toBeDefined();
    expect(button('Skip')).toBeUndefined();
    expect(container.textContent).not.toContain('Add a phone number');
  });

  it('opens the details form from the menu item', async () => {
    renderMenu(false);

    await act(async () => {
      button('Your details')!.click();
    });

    expect(
      (document.querySelector('#counsel-name') as HTMLInputElement).value,
    ).toBe('Team Typo');
  });
});
