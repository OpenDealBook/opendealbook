import { describe, expect, it } from 'vitest';

import {
  type QueuedUpload,
  attachedDocumentIds,
  hasUsableUpload,
  heldUploads,
  isAnyUploadInProgress,
  offersKeepAsZip,
  pickedUploads,
  sendBlocker,
  uploadAnnouncement,
  uploadQueue,
  uploadStatus,
} from './upload-queue';

const MEBIBYTE = 1024 * 1024;

const picked = pickedUploads([
  { key: 'a', name: 'rent-roll.xlsx', size: 4 * MEBIBYTE },
  { key: 'b', name: 'walkthrough.mp4', size: 4 * MEBIBYTE },
  { key: 'c', name: 'appraisal.pdf', size: 301 * MEBIBYTE },
  { key: 'd', name: 'term-sheet.pdf', size: 1 * MEBIBYTE },
]);

describe('pickedUploads', () => {
  it('refuses the files that cannot be uploaded and starts the rest', () => {
    expect(picked.map((upload) => upload.state)).toEqual([
      { kind: 'uploading' },
      {
        kind: 'refused',
        message:
          'walkthrough.mp4 cannot be uploaded: video and audio files are not allowed',
      },
      {
        kind: 'refused',
        message: 'appraisal.pdf is larger than the 300 MiB limit',
      },
      { kind: 'uploading' },
    ]);
  });
});

describe('uploadQueue', () => {
  it('carries each accepted file through to attached while refused files stay refused', () => {
    let queue = uploadQueue([], { kind: 'picked', uploads: picked });
    expect(sendBlocker(queue)).not.toBeNull();

    queue = uploadQueue(queue, {
      kind: 'stored',
      key: 'a',
      uploadId: 'up-a',
      registerWhen: 'when-picked',
    });
    expect(queue[0]?.state).toEqual({ kind: 'saving' });
    expect(queue[3]?.state).toEqual({ kind: 'uploading' });

    queue = uploadQueue(queue, {
      kind: 'attached',
      key: 'a',
      documentIds: ['doc-a'],
    });
    queue = uploadQueue(queue, {
      kind: 'stored',
      key: 'd',
      uploadId: 'up-d',
      registerWhen: 'when-picked',
    });
    queue = uploadQueue(queue, {
      kind: 'attached',
      key: 'd',
      documentIds: ['doc-d1', 'doc-d2'],
    });

    expect(sendBlocker(queue)).toBeNull();
    expect(attachedDocumentIds(queue)).toEqual(['doc-a', 'doc-d1', 'doc-d2']);
    expect(queue.map((upload) => upload.state.kind)).toEqual([
      'attached',
      'refused',
      'refused',
      'attached',
    ]);
  });

  it('shows the server refusal on the file it refused and leaves the others alone', () => {
    let queue = uploadQueue([], { kind: 'picked', uploads: picked });
    queue = uploadQueue(queue, {
      kind: 'refused',
      key: 'a',
      message: "Files can only be added to the room's own folder",
    });
    queue = uploadQueue(queue, {
      kind: 'stored',
      key: 'd',
      uploadId: 'up-d',
      registerWhen: 'when-picked',
    });
    queue = uploadQueue(queue, {
      kind: 'attached',
      key: 'd',
      documentIds: ['doc-d'],
    });

    expect(queue[0]?.state).toEqual({
      kind: 'refused',
      message: "Files can only be added to the room's own folder",
    });
    expect(attachedDocumentIds(queue)).toEqual(['doc-d']);
  });

  it('drops a removed file and its documents', () => {
    let queue = uploadQueue([], { kind: 'picked', uploads: picked });
    queue = uploadQueue(queue, {
      kind: 'attached',
      key: 'a',
      documentIds: ['doc-a'],
    });
    queue = uploadQueue(queue, { kind: 'removed', key: 'a' });

    expect(queue.map((upload) => upload.key)).toEqual(['b', 'c', 'd']);
    expect(attachedDocumentIds(queue)).toEqual([]);
  });

  it('starts over when cleared, ignoring late news about files no longer queued', () => {
    let queue = uploadQueue([], { kind: 'picked', uploads: picked });
    queue = uploadQueue(queue, { kind: 'cleared' });
    queue = uploadQueue(queue, {
      kind: 'attached',
      key: 'a',
      documentIds: ['doc-a'],
    });

    expect(queue).toEqual([]);
  });
});

describe('zip files', () => {
  const zipAndPdf = pickedUploads([
    { key: 'z', name: 'Diligence.ZIP', size: MEBIBYTE },
    { key: 'p', name: 'term-sheet.pdf', size: MEBIBYTE },
  ]);

  it('holds a stored zip until the lender has said whether to keep it as a zip', () => {
    let queue = uploadQueue([], { kind: 'picked', uploads: zipAndPdf });
    expect(offersKeepAsZip(queue)).toBe(false);

    queue = uploadQueue(queue, {
      kind: 'stored',
      key: 'z',
      uploadId: 'up-z',
      registerWhen: 'when-picked',
    });
    queue = uploadQueue(queue, {
      kind: 'stored',
      key: 'p',
      uploadId: 'up-p',
      registerWhen: 'when-picked',
    });

    expect(queue.map((upload) => upload.state)).toEqual([
      { kind: 'held', uploadId: 'up-z' },
      { kind: 'saving' },
    ]);
    expect(offersKeepAsZip(queue)).toBe(true);
    expect(
      sendBlocker(
        uploadQueue(queue, {
          kind: 'attached',
          key: 'p',
          documentIds: ['doc-p'],
        }),
      ),
    ).toBeNull();
    expect(attachedDocumentIds(queue)).toEqual([]);
  });

  it('does not offer the choice when no zip is selected', () => {
    let queue = uploadQueue([], { kind: 'picked', uploads: zipAndPdf });
    queue = uploadQueue(queue, {
      kind: 'stored',
      key: 'z',
      uploadId: 'up-z',
      registerWhen: 'when-picked',
    });
    queue = uploadQueue(queue, { kind: 'removed', key: 'z' });

    expect(offersKeepAsZip(queue)).toBe(false);
  });

  it('counts a held zip or an attached file as something to send, and nothing else', () => {
    let queue = uploadQueue([], { kind: 'picked', uploads: zipAndPdf });
    expect(hasUsableUpload(queue)).toBe(false);

    queue = uploadQueue(queue, {
      kind: 'stored',
      key: 'z',
      uploadId: 'up-z',
      registerWhen: 'when-picked',
    });
    expect(hasUsableUpload(queue)).toBe(true);

    queue = uploadQueue(queue, { kind: 'refused', key: 'z', message: 'no' });
    expect(hasUsableUpload(queue)).toBe(false);
  });
});

describe('files that attach when the request is sent', () => {
  const two = pickedUploads([
    { key: 'p', name: 'term-sheet.pdf', size: MEBIBYTE },
    { key: 'z', name: 'diligence.zip', size: MEBIBYTE },
  ]);

  function stored(): QueuedUpload[] {
    let queue = uploadQueue([], { kind: 'picked', uploads: two });
    queue = uploadQueue(queue, {
      kind: 'stored',
      key: 'p',
      uploadId: 'up-p',
      registerWhen: 'when-sent',
    });

    return uploadQueue(queue, {
      kind: 'stored',
      key: 'z',
      uploadId: 'up-z',
      registerWhen: 'when-sent',
    });
  }

  it('holds every stored file until the person sends', () => {
    expect(stored().map((upload) => upload.state)).toEqual([
      { kind: 'held', uploadId: 'up-p' },
      { kind: 'held', uploadId: 'up-z' },
    ]);
    expect(heldUploads(stored())).toEqual([
      { key: 'p', name: 'term-sheet.pdf', uploadId: 'up-p' },
      { key: 'z', name: 'diligence.zip', uploadId: 'up-z' },
    ]);
    expect(attachedDocumentIds(stored())).toEqual([]);
  });

  it('offers the zip choice only while a zip is waiting', () => {
    expect(offersKeepAsZip(stored())).toBe(true);
    expect(
      offersKeepAsZip(uploadQueue(stored(), { kind: 'removed', key: 'z' })),
    ).toBe(false);
  });
});

describe('an upload that fails', () => {
  const one = pickedUploads([{ key: 'a', name: 'rent-roll.csv', size: 10 }]);

  function failed(): QueuedUpload[] {
    return uploadQueue(uploadQueue([], { kind: 'picked', uploads: one }), {
      kind: 'failed',
      key: 'a',
    });
  }

  it('stops spinning and is not something to send', () => {
    expect(sendBlocker(failed())).toBeNull();
    expect(hasUsableUpload(failed())).toBe(false);
  });

  it('names the file and asks the person to try again', () => {
    expect(uploadStatus(failed()[0]!)).toEqual({
      tone: 'problem',
      text: 'rent-roll.csv could not be uploaded. Try again.',
      canRetry: true,
    });
  });

  it('goes back to uploading when retried', () => {
    expect(
      uploadQueue(failed(), { kind: 'retried', key: 'a' })[0]?.state,
    ).toEqual({ kind: 'uploading' });
  });
});

describe('uploadStatus', () => {
  function withState(state: QueuedUpload['state']) {
    return uploadStatus({ key: 'a', name: 'rent-roll.csv', state });
  }

  it('shows progress in plain stages', () => {
    expect(withState({ kind: 'uploading' }).text).toBe('Uploading');
    expect(withState({ kind: 'saving' }).text).toBe('Saving');
    expect(withState({ kind: 'held', uploadId: 'u' }).text).toBe(
      'Ready to send',
    );
    expect(withState({ kind: 'attached', documentIds: [] }).text).toBe(
      'Attached',
    );
  });

  it('shows a refusal as written, with no retry', () => {
    expect(
      withState({
        kind: 'refused',
        message: "Files can only be added to the room's own folder",
      }),
    ).toEqual({
      tone: 'problem',
      text: "Files can only be added to the room's own folder",
      canRetry: false,
    });
  });
});

describe('isAnyUploadInProgress', () => {
  it('is true while a file uploads or saves, and false once every file has settled', () => {
    expect(
      isAnyUploadInProgress([
        { key: 'a', name: 'a.pdf', state: { kind: 'saving' } },
      ]),
    ).toBe(true);
    expect(
      isAnyUploadInProgress([
        { key: 'a', name: 'a.pdf', state: { kind: 'held', uploadId: 'u' } },
        { key: 'b', name: 'b.pdf', state: { kind: 'failed' } },
      ]),
    ).toBe(false);
  });
});

describe('sendBlocker', () => {
  it('says why sending has to wait while a file is uploading', () => {
    const queue = uploadQueue([], {
      kind: 'picked',
      uploads: pickedUploads([{ key: 'a', name: 'a.pdf', size: 1 }]),
    });

    expect(sendBlocker(queue)).toBe('Waiting for files to finish uploading');
  });

  it('says nothing once every file has settled', () => {
    expect(sendBlocker([])).toBeNull();
  });
});

describe('uploadAnnouncement', () => {
  const queue = uploadQueue([], {
    kind: 'picked',
    uploads: pickedUploads([{ key: 'a', name: 'rent-roll.csv', size: 10 }]),
  });

  it('announces each picked file that starts uploading', () => {
    expect(uploadAnnouncement([], { kind: 'picked', uploads: picked })).toBe(
      'Uploading rent-roll.xlsx. Uploading term-sheet.pdf.',
    );
  });

  it('announces a file that is ready to send', () => {
    expect(
      uploadAnnouncement(queue, {
        kind: 'stored',
        key: 'a',
        uploadId: 'up-a',
        registerWhen: 'when-sent',
      }),
    ).toBe('rent-roll.csv is ready to send.');
  });

  it('announces a file that was attached', () => {
    expect(
      uploadAnnouncement(queue, {
        kind: 'attached',
        key: 'a',
        documentIds: ['d'],
      }),
    ).toBe('rent-roll.csv attached.');
  });

  it('leaves a refusal or failure to the alert on its row', () => {
    expect(uploadAnnouncement(queue, { kind: 'failed', key: 'a' })).toBeNull();
    expect(
      uploadAnnouncement(queue, { kind: 'refused', key: 'a', message: 'No' }),
    ).toBeNull();
  });

  it('announces a removal', () => {
    expect(uploadAnnouncement(queue, { kind: 'removed', key: 'a' })).toBe(
      'rent-roll.csv removed.',
    );
  });
});
