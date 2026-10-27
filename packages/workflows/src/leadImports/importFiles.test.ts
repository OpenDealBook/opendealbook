import { describe, expect, it } from 'vitest';

import type { LeadFile } from './files';
import { importFiles } from './importFiles';

const file = (name: string): LeadFile => ({
  kind: 'ppp',
  url: `https://sba.test/${name}.csv`,
  asOf: '2024-09-30',
});

describe('importFiles', () => {
  it('records why a file failed and still imports the next file', async () => {
    const imported: string[] = [];
    const failures: { importId: string; reason: string }[] = [];
    let ids = 0;

    const result = await importFiles([file('broken'), file('fine')], {
      newId: () => `import-${(ids += 1)}`,
      startLeadImport: async () => ({ skipped: false }),
      importLeadFile: async ({ file }) => {
        if (file.url.includes('broken')) {
          throw new Error('Activity task failed', {
            cause: new Error('GET https://sba.test/broken.csv answered 503'),
          });
        }
        imported.push(file.url);
      },
      matchImportedRecords: async () => {},
      failLeadImport: async (failure) => {
        failures.push(failure);
      },
      recordUndatedFile: async () => {},
    });

    expect(failures).toEqual([
      {
        importId: 'import-1',
        reason: 'GET https://sba.test/broken.csv answered 503',
      },
    ]);
    expect(imported).toEqual(['https://sba.test/fine.csv']);
    expect(result).toEqual({ failed: ['https://sba.test/broken.csv'] });
  });

  it('does not load a file whose import was skipped', async () => {
    const imported: string[] = [];

    await importFiles([file('unchanged')], {
      newId: () => 'import-1',
      startLeadImport: async () => ({ skipped: true }),
      importLeadFile: async ({ file }) => {
        imported.push(file.url);
      },
      matchImportedRecords: async () => {},
      failLeadImport: async () => {},
      recordUndatedFile: async () => {},
    });

    expect(imported).toEqual([]);
  });

  it('matches the records of each file it loads', async () => {
    const matched: { source: string; importId: string }[] = [];
    let ids = 0;

    await importFiles(
      [
        file('first'),
        {
          kind: 'form_5500_sf',
          url: 'https://dol.test/sf.zip',
          asOf: '2026-09-30',
        },
      ],
      {
        newId: () => `import-${(ids += 1)}`,
        startLeadImport: async () => ({ skipped: false }),
        importLeadFile: async () => {},
        matchImportedRecords: async (match) => {
          matched.push(match);
        },
        failLeadImport: async () => {},
        recordUndatedFile: async () => {},
      },
    );

    expect(matched).toEqual([
      { source: 'ppp', importId: 'import-1' },
      { source: 'form_5500', importId: 'import-2' },
    ]);
  });

  it('fails a file whose matching fails and still imports the next file', async () => {
    const failures: { importId: string; reason: string }[] = [];
    const imported: string[] = [];
    let ids = 0;

    const result = await importFiles([file('unmatched'), file('fine')], {
      newId: () => `import-${(ids += 1)}`,
      startLeadImport: async () => ({ skipped: false }),
      importLeadFile: async ({ file }) => {
        imported.push(file.url);
      },
      matchImportedRecords: async ({ importId }) => {
        if (importId === 'import-1') {
          throw new Error('Activity task failed', {
            cause: new Error('public_business lookup timed out'),
          });
        }
      },
      failLeadImport: async (failure) => {
        failures.push(failure);
      },
      recordUndatedFile: async () => {},
    });

    expect(failures).toEqual([
      { importId: 'import-1', reason: 'public_business lookup timed out' },
    ]);
    expect(imported).toEqual([
      'https://sba.test/unmatched.csv',
      'https://sba.test/fine.csv',
    ]);
    expect(result).toEqual({ failed: ['https://sba.test/unmatched.csv'] });
  });

  it('records a file that discovery could not date as failed and imports the rest', async () => {
    const recorded: { importId: string; reason: string }[] = [];
    const imported: string[] = [];
    let ids = 0;

    const result = await importFiles(
      [
        {
          kind: 'state_registry',
          state: 'NY',
          url: 'https://ny.test/rows.csv',
          failure: 'HEAD answered 503',
        },
        file('fine'),
      ],
      {
        newId: () => `import-${(ids += 1)}`,
        startLeadImport: async () => ({ skipped: false }),
        importLeadFile: async ({ file }) => {
          imported.push(file.url);
        },
        matchImportedRecords: async () => {},
        failLeadImport: async () => {},
        recordUndatedFile: async ({ importId, reason }) => {
          recorded.push({ importId, reason });
        },
      },
    );

    expect(recorded).toEqual([
      { importId: 'import-1', reason: 'HEAD answered 503' },
    ]);
    expect(imported).toEqual(['https://sba.test/fine.csv']);
    expect(result).toEqual({ failed: ['https://ny.test/rows.csv'] });
  });
});
