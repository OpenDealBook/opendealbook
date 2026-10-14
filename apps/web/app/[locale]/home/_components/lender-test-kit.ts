export * from '@odb/lender-rooms/requests-ui/test-support/screen.ts';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
process.env.TZ = 'UTC';

const fresh = () => ({
  calls: [] as { action: string; input: unknown }[],
  refusal: null as string | null,
  refusalFor: {} as Record<string, string>,
  crashing: [] as string[],
  values: {} as Record<string, unknown>,
  refreshes: 0,
  onRefresh: () => {},
  pathname: '/home/team-one/deals/deal-1/lenders',
});

export const fakeServer = {
  ...fresh(),
  reset() {
    Object.assign(fakeServer, fresh());
  },
  inputsTo(action: string): unknown[] {
    return fakeServer.calls
      .filter((call) => call.action === action)
      .map((call) => call.input);
  },
};

export function fakeActions<Name extends string>(...names: Name[]) {
  return Object.fromEntries(
    names.map((action) => [
      action,
      async (input: unknown) => {
        fakeServer.calls.push({ action, input });

        if (fakeServer.crashing.includes(action)) {
          throw new Error(`${action} crashed`);
        }

        const refusal = fakeServer.refusalFor[action] ?? fakeServer.refusal;

        if (refusal) {
          return { ok: false, refusal };
        }

        return { ok: true, value: fakeServer.values[action] };
      },
    ]),
  ) as Record<
    Name,
    (
      input: unknown,
    ) => Promise<{ ok: true; value: unknown } | { ok: false; refusal: string }>
  >;
}

export const navigation = {
  useRouter: () => ({
    refresh: () => {
      fakeServer.refreshes += 1;
      fakeServer.onRefresh();
    },
    push: (href: string) => {
      fakeServer.pathname = href;
    },
  }),
  usePathname: () => fakeServer.pathname,
};

export function links(): { text: string; href: string | null }[] {
  return [...document.querySelectorAll('a')].map((anchor) => ({
    text:
      anchor.getAttribute('aria-label') ??
      (anchor.textContent ?? '').replace(/\s+/g, ' ').trim(),
    href: anchor.getAttribute('href'),
  }));
}

export function linkTo(text: string): string | null | undefined {
  return links().find((link) => link.text === text)?.href;
}

export const fakeViewer = {
  FileViewer: (props: {
    fileName: string;
    previewUrl: string;
    downloadUrl: string;
  }) => `Viewer showing ${props.fileName} from ${props.previewUrl}`,
};
