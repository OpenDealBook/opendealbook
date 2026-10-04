import { fileURLToPath } from 'node:url';

import { uploadTemplateFixtures } from './upload-template-fixtures';

export async function main(): Promise<void> {
  await uploadTemplateFixtures();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
