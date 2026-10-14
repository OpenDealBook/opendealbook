import { uploadRefusal } from '../uploads/allowed';

type UploadState =
  | { kind: 'uploading' }
  | { kind: 'saving' }
  | { kind: 'held'; uploadId: string }
  | { kind: 'attached'; documentIds: string[] }
  | { kind: 'refused'; message: string }
  | { kind: 'failed' };

export interface QueuedUpload {
  key: string;
  name: string;
  state: UploadState;
}

export type RegisterWhen = 'when-picked' | 'when-sent';

type UploadEvent =
  | { kind: 'picked'; uploads: QueuedUpload[] }
  | {
      kind: 'stored';
      key: string;
      uploadId: string;
      registerWhen: RegisterWhen;
    }
  | { kind: 'attached'; key: string; documentIds: string[] }
  | { kind: 'refused'; key: string; message: string }
  | { kind: 'failed'; key: string }
  | { kind: 'retried'; key: string }
  | { kind: 'removed'; key: string }
  | { kind: 'cleared' };

export function isZip(name: string): boolean {
  return /\.zip$/i.test(name);
}

export function waitsToBeSent(
  name: string,
  registerWhen: RegisterWhen,
): boolean {
  return registerWhen === 'when-sent' || isZip(name);
}

export function pickedUploads(
  files: { key: string; name: string; size: number }[],
): QueuedUpload[] {
  return files.map((file) => {
    const message = uploadRefusal(file);

    return {
      key: file.key,
      name: file.name,
      state: message ? { kind: 'refused', message } : { kind: 'uploading' },
    };
  });
}

function stateAfter(upload: QueuedUpload, event: UploadEvent): UploadState {
  switch (event.kind) {
    case 'stored':
      return waitsToBeSent(upload.name, event.registerWhen)
        ? { kind: 'held', uploadId: event.uploadId }
        : { kind: 'saving' };
    case 'attached':
      return { kind: 'attached', documentIds: event.documentIds };
    case 'refused':
      return { kind: 'refused', message: event.message };
    case 'failed':
      return { kind: 'failed' };
    case 'retried':
      return { kind: 'uploading' };
    default:
      return upload.state;
  }
}

export function uploadQueue(
  queue: QueuedUpload[],
  event: UploadEvent,
): QueuedUpload[] {
  switch (event.kind) {
    case 'picked':
      return [...queue, ...event.uploads];
    case 'removed':
      return queue.filter((upload) => upload.key !== event.key);
    case 'cleared':
      return [];
    default:
      return queue.map((upload) =>
        upload.key === event.key
          ? { ...upload, state: stateAfter(upload, event) }
          : upload,
      );
  }
}

export function isAnyUploadInProgress(queue: QueuedUpload[]): boolean {
  return queue.some(
    (upload) =>
      upload.state.kind === 'uploading' || upload.state.kind === 'saving',
  );
}

export function sendBlocker(queue: QueuedUpload[]): string | null {
  return isAnyUploadInProgress(queue)
    ? 'Waiting for files to finish uploading'
    : null;
}

export function attachedDocumentIds(queue: QueuedUpload[]): string[] {
  return queue.flatMap((upload) =>
    upload.state.kind === 'attached' ? upload.state.documentIds : [],
  );
}

export function heldUploads(queue: QueuedUpload[]) {
  return queue.flatMap((upload) =>
    upload.state.kind === 'held'
      ? [
          {
            key: upload.key,
            name: upload.name,
            uploadId: upload.state.uploadId,
          },
        ]
      : [],
  );
}

export function offersKeepAsZip(queue: QueuedUpload[]): boolean {
  return heldUploads(queue).some((upload) => isZip(upload.name));
}

export function hasUsableUpload(queue: QueuedUpload[]): boolean {
  return queue.some(
    (upload) =>
      upload.state.kind === 'held' || upload.state.kind === 'attached',
  );
}

function failureWording(name: string): string {
  return `${name} could not be uploaded. Try again.`;
}

export function uploadStatus(upload: QueuedUpload): {
  tone: 'working' | 'done' | 'problem';
  text: string;
  canRetry: boolean;
} {
  switch (upload.state.kind) {
    case 'uploading':
      return { tone: 'working', text: 'Uploading', canRetry: false };
    case 'saving':
      return { tone: 'working', text: 'Saving', canRetry: false };
    case 'held':
      return { tone: 'done', text: 'Ready to send', canRetry: false };
    case 'attached':
      return { tone: 'done', text: 'Attached', canRetry: false };
    case 'refused':
      return { tone: 'problem', text: upload.state.message, canRetry: false };
    case 'failed':
      return {
        tone: 'problem',
        text: failureWording(upload.name),
        canRetry: true,
      };
  }
}

export function uploadAnnouncement(
  queue: QueuedUpload[],
  event: UploadEvent,
): string | null {
  if (event.kind === 'picked') {
    return event.uploads
      .flatMap((upload) =>
        upload.state.kind === 'refused' ? [] : [`Uploading ${upload.name}.`],
      )
      .join(' ');
  }

  if (event.kind === 'cleared') {
    return null;
  }

  const upload = queue.find((each) => each.key === event.key);

  if (!upload) {
    return null;
  }

  switch (event.kind) {
    case 'stored':
      return waitsToBeSent(upload.name, event.registerWhen)
        ? `${upload.name} is ready to send.`
        : null;
    case 'attached':
      return `${upload.name} attached.`;
    case 'refused':
    case 'failed':
      return null;
    case 'retried':
      return `Uploading ${upload.name}.`;
    case 'removed':
      return `${upload.name} removed.`;
  }
}
