interface Deferred {
  promise: Promise<void>;
  release: () => void;
}

function deferred(): Deferred {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });

  return { promise, release };
}

type Step = 'begin' | 'store' | 'register' | 'send';

const fresh = () => ({
  requests: [] as unknown[],
  forms: [] as unknown[],
  replies: [] as unknown[],
  edits: [] as unknown[],
  replacedWith: [] as unknown[],
  routeChanges: [] as unknown[],
  moves: [] as string[],
  begun: [] as unknown[],
  registered: [] as { uploadId: string; keepAsZip: boolean }[],
  cancelled: [] as string[],
  refusal: null as string | null,
  crashesAt: [] as Step[],
  storageHold: null as Deferred | null,
  sendHold: null as Deferred | null,
  sentFormTitles: {} as Record<string, string>,
  refreshes: 0,
  pathname: '/lender/7d0f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11/requests',
});

export const fakeRoom = {
  ...fresh(),
  reset() {
    Object.assign(fakeRoom, fresh());
  },
  holdStorage() {
    fakeRoom.storageHold = deferred();
  },
  releaseStorage() {
    fakeRoom.storageHold?.release();
    fakeRoom.storageHold = null;
  },
  holdSending() {
    fakeRoom.sendHold = deferred();
  },
  releaseSending() {
    fakeRoom.sendHold?.release();
    fakeRoom.sendHold = null;
  },
};

function crashIf(step: Step) {
  if (fakeRoom.crashesAt.includes(step)) {
    fakeRoom.crashesAt = fakeRoom.crashesAt.filter((each) => each !== step);
    throw new Error(`the ${step} step crashed`);
  }
}

function sends<Input>(record: (input: Input) => unknown) {
  return async (input: Input) => {
    await fakeRoom.sendHold?.promise;
    crashIf('send');

    if (fakeRoom.refusal) {
      return { ok: false, refusal: fakeRoom.refusal };
    }

    return { ok: true, value: record(input) };
  };
}

export const askActions = {
  openAsk: sends((input) => fakeRoom.requests.push(input)),
  replyToAskAsLender: sends((input) => fakeRoom.replies.push(input)),
  editAsk: sends((input) => fakeRoom.edits.push(input)),
  withdrawAsk: sends(() => fakeRoom.moves.push('withdrawn')),
  closeAskAsLender: sends(() => fakeRoom.moves.push('closed')),
};

export const formActions = {
  openForm: sends((input) => fakeRoom.forms.push(input)),
  replyToFormAsLender: sends((input) => fakeRoom.replies.push(input)),
  editForm: sends((input) => fakeRoom.edits.push(input)),
  withdrawForm: sends(() => fakeRoom.moves.push('withdrawn')),
  closeFormAsLender: sends(() => fakeRoom.moves.push('closed')),
  replaceBlankForm: sends((input) => fakeRoom.replacedWith.push(input)),
  changeReturnRoute: sends((input) => fakeRoom.routeChanges.push(input)),
  sentFormTitle: async ({ name }: { name: string }) => ({
    ok: true,
    value: fakeRoom.sentFormTitles[name] ?? null,
  }),
};

export const uploadActions = {
  beginUpload: async (input: { name: string }) => {
    crashIf('begin');
    fakeRoom.begun.push(input);
    const { name } = input;

    return {
      ok: true,
      value: { uploadId: `upload:${name}`, path: 'path', token: 'token' },
    };
  },
  registerUpload: async (input: { uploadId: string; keepAsZip: boolean }) => {
    crashIf('register');
    fakeRoom.registered.push(input);

    return { ok: true, value: [`document:${input.uploadId}`] };
  },
  cancelUpload: async ({ uploadId }: { uploadId: string }) => {
    fakeRoom.cancelled.push(uploadId);

    return { ok: true, value: undefined };
  },
};

export const browserClient = {
  getSupabaseBrowserClient: () => ({
    storage: {
      from: () => ({
        uploadToSignedUrl: async () => {
          await fakeRoom.storageHold?.promise;

          return fakeRoom.crashesAt.includes('store')
            ? ((fakeRoom.crashesAt = fakeRoom.crashesAt.filter(
                (each) => each !== 'store',
              )),
              { error: new Error('S3 said: SlowDown 503 bucket=data-room') })
            : { error: null };
        },
      }),
    },
  }),
};

export const navigation = {
  useRouter: () => ({
    refresh: () => {
      fakeRoom.refreshes += 1;
    },
    push: (href: string) => {
      fakeRoom.pathname = href;
    },
  }),
  usePathname: () => fakeRoom.pathname,
};
