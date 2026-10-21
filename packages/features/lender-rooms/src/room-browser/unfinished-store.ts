import type {
  ForgottenIds,
  UnfinishedStore,
  UnfinishedUpload,
} from './unfinished-uploads';

const DATABASE = 'lender-room-uploads';
const VERSION = 2;
const UPLOADS = 'unfinished';
const BY_PERSON = 'userId';
const FORGOTTEN_KEY = 'lender-room-uploads-forgotten';

function settled<Result>(request: IDBRequest<Result>): Promise<Result> {
  return new Promise((done, failed) => {
    request.onsuccess = () => done(request.result);
    request.onerror = () => failed(request.error);
  });
}

function committed(transaction: IDBTransaction): Promise<void> {
  return new Promise((done, failed) => {
    transaction.oncomplete = () => done();
    transaction.onabort = () => failed(transaction.error);
  });
}

let database: Promise<IDBDatabase> | null = null;

function opened(): Promise<IDBDatabase> {
  database ??= new Promise<IDBDatabase>((done, failed) => {
    const opening = indexedDB.open(DATABASE, VERSION);

    opening.onupgradeneeded = () => {
      if (opening.result.objectStoreNames.contains(UPLOADS)) {
        opening.result.deleteObjectStore(UPLOADS);
      }

      opening.result
        .createObjectStore(UPLOADS, { keyPath: 'id' })
        .createIndex(BY_PERSON, 'userId');
    };
    opening.onblocked = () =>
      failed(new Error('Another tab is holding an older upload store open'));
    opening.onsuccess = () => {
      opening.result.onversionchange = () => {
        opening.result.close();
        database = null;
      };
      done(opening.result);
    };
    opening.onerror = () => failed(opening.error);
  }).catch((error: unknown) => {
    database = null;
    throw error;
  });

  return database;
}

async function uploads(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return (await opened()).transaction(UPLOADS, mode).objectStore(UPLOADS);
}

export const unfinishedStore: UnfinishedStore = {
  async put(upload) {
    const store = await uploads('readwrite');

    store.put(upload);
    await committed(store.transaction);
  },
  async remove(id) {
    const store = await uploads('readwrite');

    store.delete(id);
    await committed(store.transaction);
  },
  async listForPerson(userId) {
    const store = await uploads('readonly');

    return settled<UnfinishedUpload[]>(store.index(BY_PERSON).getAll(userId));
  },
};

export const forgottenIds: ForgottenIds = {
  read() {
    try {
      const stored: unknown = JSON.parse(
        localStorage.getItem(FORGOTTEN_KEY) ?? '[]',
      );

      return Array.isArray(stored)
        ? stored.filter((id) => typeof id === 'string')
        : [];
    } catch {
      return [];
    }
  },
  write(ids) {
    try {
      localStorage.setItem(FORGOTTEN_KEY, JSON.stringify(ids));
    } catch {}
  },
};

let hasReported = false;

export function reportStoreFailure(error: unknown) {
  if (!hasReported) {
    hasReported = true;
    console.error('Remembering unfinished uploads failed', error);
  }
}
