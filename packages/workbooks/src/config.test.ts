import { describe, expect, it } from 'vitest';

import { parseWorkbookConfig } from './config';

const validBrokerConfig = {
  dealLeadUserId: 'user-1',
  fromEmail: 'deals@example.com',
  subject: 'Quarterly catch-up',
  updates: 'We closed two deals.',
  bookACallUrl: 'https://cal.example/team',
};

describe('parseWorkbookConfig', () => {
  it('parses a valid broker_catch_up config', () => {
    expect(parseWorkbookConfig('broker_catch_up', validBrokerConfig)).toEqual(
      validBrokerConfig,
    );
  });

  it('rejects an unknown workflow type', () => {
    expect(() => parseWorkbookConfig('mystery', validBrokerConfig)).toThrow(
      /Unknown workbook workflow type/,
    );
  });

  it('rejects a broker config with a bad email', () => {
    expect(() =>
      parseWorkbookConfig('broker_catch_up', {
        ...validBrokerConfig,
        fromEmail: 'not-an-email',
      }),
    ).toThrow();
  });
});
