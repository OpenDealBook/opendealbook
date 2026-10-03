import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  renderer: vi.fn(),
}));

vi.mock('@odb/mailers', () => ({
  getMailer: async () => ({ sendEmail: state.sendEmail }),
}));

vi.mock('@odb/email-templates', () => ({
  EMAIL_TEMPLATE_RENDERERS: new Proxy(
    {},
    { get: () => state.renderer },
  ),
}));

vi.mock('@odb/supabase/admin', () => ({
  getSupabaseServerAdminClient: () => ({}),
}));

const { sendTrialDripEmail, DEFAULT_TRIAL_DRIP_FROM } = await import(
  './activities'
);

afterEach(() => {
  state.sendEmail.mockReset();
  state.renderer.mockReset();
  delete process.env.TRIAL_DRIP_FROM_EMAIL;
});

const rendered = { subject: 'S', html: '<p>H</p>', text: 'T' };

describe('sendTrialDripEmail', () => {
  it('sends the rendered template to the recipient from the default sender', async () => {
    state.renderer.mockResolvedValueOnce(rendered);

    await sendTrialDripEmail({
      to: 'user@example.com',
      dayKey: 'trial-day-1',
      productName: 'Open Deal Book',
      link: 'https://opendealbook.app/deals/new',
    });

    expect(state.sendEmail).toHaveBeenCalledWith({
      to: 'user@example.com',
      from: DEFAULT_TRIAL_DRIP_FROM,
      subject: 'S',
      html: '<p>H</p>',
      text: 'T',
    });
  });

  it('sends from the configured sender when TRIAL_DRIP_FROM_EMAIL is set', async () => {
    process.env.TRIAL_DRIP_FROM_EMAIL = 'Trials <trials@opendealbook.app>';
    state.renderer.mockResolvedValueOnce(rendered);

    await sendTrialDripEmail({
      to: 'user@example.com',
      dayKey: 'trial-day-1',
      productName: 'Open Deal Book',
      link: 'https://opendealbook.app/deals/new',
    });

    expect(state.sendEmail.mock.calls[0]?.[0].from).toBe(
      'Trials <trials@opendealbook.app>',
    );
  });

  it('passes the day-6 link as the upgrade link', async () => {
    state.renderer.mockResolvedValueOnce(rendered);

    await sendTrialDripEmail({
      to: 'user@example.com',
      dayKey: 'trial-day-6',
      productName: 'Open Deal Book',
      link: 'https://opendealbook.app/billing/plans',
    });

    expect(state.renderer.mock.calls[0]?.[0]).toMatchObject({
      upgradeLink: 'https://opendealbook.app/billing/plans',
    });
  });
});
