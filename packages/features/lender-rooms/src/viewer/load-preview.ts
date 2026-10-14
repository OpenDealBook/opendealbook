import { type DocumentKind, type Preview, parsePreview } from './parse-preview';

const MEBIBYTE = 1024 * 1024;

function byteLimit(kind: DocumentKind): number {
  return (kind === 'text' ? 2 : 50) * MEBIBYTE;
}

function landedOnOurOwnPage(response: Response): boolean {
  return (
    response.redirected &&
    new URL(response.url).origin === window.location.origin
  );
}

async function loadPreview(
  kind: DocumentKind,
  previewUrl: string,
): Promise<Preview> {
  let response: Response;
  try {
    response = await fetch(previewUrl);
  } catch {
    return { kind: 'none', reason: 'not-loaded' };
  }
  if (!response.ok || landedOnOurOwnPage(response)) {
    return { kind: 'none', reason: 'not-loaded' };
  }
  const limit = byteLimit(kind);
  if (Number(response.headers.get('content-length')) > limit) {
    return { kind: 'none', reason: 'too-large' };
  }
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > limit) return { kind: 'none', reason: 'too-large' };
  return parsePreview(kind, bytes);
}

type HeldPreview = { loading: Promise<Preview>; holders: number };

const heldByUrl = new Map<string, HeldPreview>();

export function holdPreview(
  kind: DocumentKind,
  previewUrl: string,
): { loading: Promise<Preview>; release: () => void } {
  const held = heldByUrl.get(previewUrl) ?? {
    loading: loadPreview(kind, previewUrl),
    holders: 0,
  };
  heldByUrl.set(previewUrl, held);
  held.holders += 1;
  return {
    loading: held.loading,
    release: () => {
      held.holders -= 1;
      // A strict-mode remount takes the hold again before this microtask runs.
      queueMicrotask(() => {
        if (held.holders > 0 || heldByUrl.get(previewUrl) !== held) return;
        heldByUrl.delete(previewUrl);
        void held.loading.then(
          (preview) => {
            if (preview.kind === 'pdf') {
              void preview.document.loadingTask.destroy();
            }
          },
          () => {},
        );
      });
    },
  };
}
