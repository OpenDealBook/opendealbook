import { describe, expect, it, vi } from 'vitest';

import { isLoiSigned } from './loi';

function stubClient(rows: unknown[]) {
  const eqSpy = vi.fn();
  const builder: Record<string, unknown> = {};
  const chain = () => builder;

  builder.select = chain;
  builder.throwOnError = chain;
  builder.eq = (column: string, value: unknown) => {
    eqSpy(column, value);
    return builder;
  };
  builder.then = (resolve: (value: unknown) => void) =>
    resolve({ data: rows, error: null });

  const from = vi.fn(() => builder);

  return { client: { from } as never, eqSpy };
}

describe('isLoiSigned', () => {
  it('is true when a loi contract has a signed version', async () => {
    const { client, eqSpy } = stubClient([{ id: 'contract-1' }]);

    await expect(isLoiSigned(client, 'deal-1')).resolves.toBe(true);

    expect(eqSpy).toHaveBeenCalledWith('type', 'loi');
    expect(eqSpy).toHaveBeenCalledWith('contract_version.is_signed', true);
  });

  it('is false when no loi contract has a signed version', async () => {
    const { client } = stubClient([]);

    await expect(isLoiSigned(client, 'deal-1')).resolves.toBe(false);
  });
});
