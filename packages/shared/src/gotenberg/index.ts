import { requireEnv } from '../env/index';

const CONVERSION_TIMEOUT_MS = 60_000;

export async function convertWithGotenberg(
  route: string,
  file: Blob,
  fileName: string,
): Promise<Uint8Array> {
  const form = new FormData();
  form.append('files', file, fileName);

  const response = await fetch(`${requireEnv('GOTENBERG_URL')}${route}`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(CONVERSION_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(
      `Gotenberg conversion failed: ${response.status} ${(await response.text()).slice(0, 200)}`,
    );
  }

  return new Uint8Array(await response.arrayBuffer());
}
