import { createClient } from '@supabase/supabase-js';

import { strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';

import type { Database } from '@odb/supabase';

import { ensurePreviewRendition } from './renditions';

const admin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const bucket = admin.storage.from('data-room');

const HEIC_SAMPLE = Uint8Array.from(
  Buffer.from(
    'AAAAJGZ0eXBoZWljAAAAAG1pZjFNaVBybWlhZk1pSEJoZWljAAABhm1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAHBpY3QAAAAAAAAAAAAAAAAAAAAAJGRpbmYAAAAcZHJlZgAAAAAAAAABAAAADHVybCAAAAABAAAADnBpdG0AAAAAAAEAAAAjaWluZgAAAAAAAQAAABVpbmZlAgAAAAABAABodmMxAAAAAOZpcHJwAAAAxWlwY28AAAATY29scm5jbHgAAgACAAaAAAAADGNsbGkAywBAAAAAFGlzcGUAAAAAAAAAEAAAABAAAAAJaXJvdAAAAAAQcGl4aQAAAAADCAgIAAAAcWh2Y0MBA3AAAACwAAAAAAAe8AD8/fj4AAALA6AAAQAXQAEMAf//A3AAAAMAsAAAAwAAAwAecCShAAEAI0IBAQNwAAADALAAAAMAAAMAHqAUIEHAkwziHuRZVNwICBgCogABAAlEAcBhcshAUyQAAAAZaXBtYQAAAAAAAAABAAEGgQIDBYaEAAAAHmlsb2MAAAAARAAAAQABAAAAAQAAAboAAAA8AAAAAW1kYXQAAAAAAAAATAAAADgoAa+jVyq0//uP//pu7LpGtUf/1Wp//ezf/2vFV3/6XT79Wvf7YA7O/7/vppoS01HCM8ULq1Lu4A==',
    'base64',
  ),
);

async function stored(name: string, bytes: Uint8Array): Promise<string> {
  const storagePath = `deal/${crypto.randomUUID()}/${crypto.randomUUID()}-${name}`;
  const uploaded = await bucket.upload(storagePath, bytes);

  if (uploaded.error) {
    throw uploaded.error;
  }

  return storagePath;
}

describe('ensurePreviewRendition', { timeout: 30_000 }, () => {
  it('creates the JPEG rendition of a HEIC file that has none', async () => {
    const storagePath = await stored('photo.heic', HEIC_SAMPLE);

    await ensurePreviewRendition(admin, { storagePath, name: 'photo.heic' });

    const preview = await bucket.download(`${storagePath}.preview.jpg`);
    expect(preview.data?.type).toBe('image/jpeg');
  });

  it('leaves an existing rendition untouched', async () => {
    const storagePath = await stored('photo.heic', HEIC_SAMPLE);
    await bucket.upload(`${storagePath}.preview.jpg`, strToU8('already here'));

    await ensurePreviewRendition(admin, { storagePath, name: 'photo.heic' });

    const preview = await bucket.download(`${storagePath}.preview.jpg`);
    expect(await preview.data?.text()).toBe('already here');
  });

  it('does nothing for a type that has no rendition', async () => {
    const storagePath = await stored('report.pdf', strToU8('%PDF'));

    await ensurePreviewRendition(admin, { storagePath, name: 'report.pdf' });

    const beside = await bucket.list(
      storagePath.slice(0, storagePath.lastIndexOf('/')),
    );
    expect(beside.data?.map((object) => object.name)).toEqual([
      storagePath.slice(storagePath.lastIndexOf('/') + 1),
    ]);
  });

  it('throws, naming the file, when the conversion fails', async () => {
    const storagePath = await stored('broken.heic', strToU8('not an image'));

    await expect(
      ensurePreviewRendition(admin, { storagePath, name: 'broken.heic' }),
    ).rejects.toThrow('broken.heic could not be converted for preview');
  });

  it('does not attempt a rendition for a HEIC over 50 MiB', async () => {
    const storagePath = await stored(
      'huge.heic',
      new Uint8Array(50 * 1024 * 1024 + 1),
    );

    await ensurePreviewRendition(admin, { storagePath, name: 'huge.heic' });

    expect((await bucket.exists(`${storagePath}.preview.jpg`)).data).toBe(
      false,
    );
  });
});
