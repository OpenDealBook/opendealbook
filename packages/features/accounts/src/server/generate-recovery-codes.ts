import { randomBytes } from 'node:crypto';

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_LENGTH = 10;
const GROUP_SIZE = 5;
const REJECTION_CEILING = Math.floor(256 / ALPHABET.length) * ALPHABET.length;

export function generateRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, mintCode);
}

export function normalizeRecoveryCode(code: string): string {
  return code.replace(/[\s-]+/g, '').toUpperCase();
}

function mintCode(): string {
  const symbols = Array.from({ length: CODE_LENGTH }, () =>
    ALPHABET.charAt(uniformIndex()),
  );

  const groups: string[] = [];

  for (let i = 0; i < symbols.length; i += GROUP_SIZE) {
    groups.push(symbols.slice(i, i + GROUP_SIZE).join(''));
  }

  return groups.join('-');
}

function uniformIndex(): number {
  while (true) {
    const byte = randomBytes(1)[0]!;

    if (byte < REJECTION_CEILING) {
      return byte % ALPHABET.length;
    }
  }
}
