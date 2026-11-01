import { uploadTemplateFixtures } from './upload-template-fixtures';

import { fileURLToPath } from 'node:url';

export async function main(): Promise<void> {
  await uploadTemplateFixtures();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
