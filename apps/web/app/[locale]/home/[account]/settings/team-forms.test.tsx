// @vitest-environment jsdom
import { createElement } from 'react';

import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  alerts,
  button,
  clearScreen,
  field,
  fields,
  pageText,
  settle,
  show,
  submit,
  type,
} from '@odb/lender-rooms/requests-ui/test-support/screen.ts';

import { CreateTeamForm } from '../../../../../../../packages/features/team-accounts/src/components/create-team-form';
import { UpdateTeamForm } from '../../../../../../../packages/features/team-accounts/src/components/settings/update-team-form';

const updateTeamAction = vi.hoisted(() => vi.fn());

vi.mock(
  '../../../../../../../packages/features/team-accounts/src/server/settings-actions',
  () => ({ updateTeamAction }),
);

vi.mock(
  '../../../../../../../packages/features/team-accounts/src/server/create-team-action',
  () => ({
    createTeamAccountAction: async (input: unknown) => {
      createTeamInputs.push(input);
      return { slug: 'acme-1' };
    },
  }),
);

const createTeamInputs: unknown[] = [];

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

afterEach(() => {
  clearScreen();
  vi.unstubAllGlobals();
  updateTeamAction.mockReset();
});

describe('UpdateTeamForm', () => {
  it('shows the current slug without letting it be edited', async () => {
    show(
      createElement(UpdateTeamForm, {
        accountId: '1b0f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11',
        name: 'Acme',
        slug: 'acme',
        permissions: ['settings.manage'],
        locale: 'en',
      }),
    );

    expect(fields('Slug')).toEqual([]);
    expect(pageText()).toContain('acme');
  });

  it('submits the legal entity name with the team name', async () => {
    updateTeamAction.mockResolvedValue({ success: true, slug: 'acme' });
    vi.stubGlobal('location', {
      pathname: '/home/acme',
      search: '',
      assign: vi.fn(),
    });

    show(
      createElement(UpdateTeamForm, {
        accountId: '1b0f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11',
        name: 'Acme',
        legalEntityName: '',
        slug: 'acme',
        permissions: ['settings.manage'],
        locale: 'en',
      }),
    );

    await type('Legal entity name', 'Acme Acquisitions LLC');
    await submit('Legal entity name');
    await settle();

    expect(updateTeamAction).toHaveBeenCalledWith(
      expect.objectContaining({ legalEntityName: 'Acme Acquisitions LLC' }),
    );
  });

  it('shows the team phone and submits a change to it', async () => {
    updateTeamAction.mockResolvedValue({ success: true, slug: 'acme' });
    vi.stubGlobal('location', {
      pathname: '/home/acme',
      search: '',
      assign: vi.fn(),
    });

    show(
      createElement(UpdateTeamForm, {
        accountId: '1b0f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11',
        name: 'Acme',
        teamPhone: '+1 555 0100',
        slug: 'acme',
        permissions: ['settings.manage'],
        locale: 'en',
      }),
    );

    expect(field('Team phone').value).toBe('+1 555 0100');

    await type('Team phone', '+1 555 0200');
    await submit('Team phone');
    await settle();

    expect(updateTeamAction).toHaveBeenCalledWith(
      expect.objectContaining({ teamPhone: '+1 555 0200' }),
    );
  });

  it('loads the same page under the new slug after a rename', async () => {
    updateTeamAction.mockResolvedValue({
      success: true,
      slug: 'initech-partners',
    });
    const assign = vi.fn();
    vi.stubGlobal('location', {
      pathname: '/fr/home/acme/settings',
      search: '?tab=general',
      assign,
    });

    show(
      createElement(UpdateTeamForm, {
        accountId: '1b0f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11',
        name: 'Acme',
        slug: 'acme',
        permissions: ['settings.manage'],
        locale: 'en',
      }),
    );

    await type('Team name', 'Initech Partners');
    await submit('Team name');
    await settle();

    expect(assign).toHaveBeenCalledWith(
      '/fr/home/initech-partners/settings?tab=general',
    );
  });

  it('says Saved and stays on the page when the slug does not change', async () => {
    updateTeamAction.mockResolvedValue({ success: true, slug: 'acme' });
    const assign = vi.fn();
    vi.stubGlobal('location', { pathname: '/home/acme', search: '', assign });

    show(
      createElement(UpdateTeamForm, {
        accountId: '1b0f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11',
        name: 'Acme',
        legalEntityName: '',
        slug: 'acme',
        permissions: ['settings.manage'],
        locale: 'en',
      }),
    );

    await type('Legal entity name', 'Acme Acquisitions LLC');
    await submit('Legal entity name');
    await settle();

    expect(pageText()).toContain('Saved');
    expect(assign).not.toHaveBeenCalled();
  });

  it('shows a member the team settings locked with the reason', () => {
    show(
      createElement(UpdateTeamForm, {
        accountId: '1b0f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11',
        name: 'Acme',
        slug: 'acme',
        permissions: [],
        locale: 'en',
      }),
    );

    expect(pageText()).toContain(
      'Only team owners and admins can change team settings.',
    );
    expect(field('Team name').matches(':disabled')).toBe(true);
    expect(button('Save changes').matches(':disabled')).toBe(true);
  });

  it('shows when a refused rename is allowed again and locks the name', async () => {
    updateTeamAction.mockResolvedValue({
      success: false,
      renameAllowedAt: '2026-11-13T12:00:00+00:00',
    });
    const assign = vi.fn();
    vi.stubGlobal('location', { pathname: '/home/acme', search: '', assign });

    show(
      createElement(UpdateTeamForm, {
        accountId: '1b0f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11',
        name: 'Acme',
        slug: 'acme',
        permissions: ['settings.manage'],
        locale: 'en',
      }),
    );

    await type('Team name', 'Globex');
    await submit('Team name');
    await settle();

    expect(alerts()).toContain('You can rename again on November 13, 2026');
    expect(field('Team name').disabled).toBe(true);
    expect(button('Save changes').disabled).toBe(true);
    expect(assign).not.toHaveBeenCalled();
  });

  it('opens with the name locked while a recent rename is still blocking', () => {
    show(
      createElement(UpdateTeamForm, {
        accountId: '1b0f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11',
        name: 'Acme',
        slug: 'acme',
        permissions: ['settings.manage'],
        locale: 'en',
        renameAllowedAt: '2026-11-13T12:00:00+00:00',
      }),
    );

    expect(alerts()).toContain('You can rename again on November 13, 2026');
    expect(field('Team name').disabled).toBe(true);
    expect(button('Save changes').disabled).toBe(true);
  });

  it('still saves a team phone change while the name is locked', async () => {
    show(
      createElement(UpdateTeamForm, {
        accountId: '1b0f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11',
        name: 'Acme',
        slug: 'acme',
        permissions: ['settings.manage'],
        locale: 'en',
        renameAllowedAt: '2026-11-13T12:00:00+00:00',
      }),
    );

    await type('Team phone', '+1 555 0200');

    expect(button('Save changes').disabled).toBe(false);
  });

  it('writes the date in the app locale', () => {
    show(
      createElement(UpdateTeamForm, {
        accountId: '1b0f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11',
        name: 'Acme',
        slug: 'acme',
        permissions: ['settings.manage'],
        locale: 'fr',
        renameAllowedAt: '2026-11-13T12:00:00+00:00',
      }),
    );

    expect(alerts()).toContain('You can rename again on 13 novembre 2026');
  });

  it('leaves the date out of the server render so the time zone comes from the browser', () => {
    const html = renderToString(
      createElement(UpdateTeamForm, {
        accountId: '1b0f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11',
        name: 'Acme',
        slug: 'acme',
        permissions: ['settings.manage'],
        locale: 'en',
        renameAllowedAt: '2026-11-13T12:00:00+00:00',
      }),
    );

    expect(html).not.toContain('2026');
  });
});

describe('CreateTeamForm', () => {
  it('reports the slug the database assigned, not the one typed', async () => {
    const onSuccess = vi.fn();

    show(createElement(CreateTeamForm, { onSuccess }));

    await type('Team name', 'Acme');
    await submit('Team name');
    await settle();

    expect(onSuccess).toHaveBeenCalledWith('acme-1');
  });

  it('asks only for a name and leaves the slug to the database', async () => {
    createTeamInputs.length = 0;

    show(createElement(CreateTeamForm, {}));

    expect(fields('Slug')).toEqual([]);

    await type('Team name', 'Acme');
    await submit('Team name');
    await settle();

    expect(createTeamInputs).toEqual([{ name: 'Acme' }]);
  });
});
