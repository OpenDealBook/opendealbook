import { describe, expect, it } from 'vitest';

import { withDownloadName } from './download-name';

describe('withDownloadName', () => {
  it('names the download once-encoded on a URL signed for download', () => {
    const named = withDownloadName(
      'http://127.0.0.1:54321/storage/v1/object/sign/data-room/a?token=t&download=',
      'P&L 2024.xlsx',
    );

    expect(new URL(named).searchParams.get('download')).toBe('P&L 2024.xlsx');
    expect(new URL(named).searchParams.get('token')).toBe('t');
  });
});
