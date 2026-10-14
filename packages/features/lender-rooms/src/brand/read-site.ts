import { parseSite } from './parse-site';
import {
  type HostAddress,
  type HostLookup,
  publicAddress,
} from './public-host';
import { sniffImageType } from './sniff-image';

export interface SiteResponse {
  status: number;
  location: string | undefined;
  contentType: string | undefined;
  body: AsyncIterable<Uint8Array>;
}

export type SiteRequest = (
  url: URL,
  init: { address: HostAddress; signal: AbortSignal },
) => Promise<SiteResponse>;

export interface SiteAccess {
  lookup: HostLookup;
  request: SiteRequest;
}

interface Budget {
  requests: number;
  deadline: AbortSignal;
}

interface Icon {
  bytes: Uint8Array;
  contentType: string;
}

class NoBrandError extends Error {}

const MAX_REDIRECTS = 5;
const MAX_REQUESTS = 8;
const REQUEST_TIMEOUT_MS = 5_000;
const TOTAL_TIMEOUT_MS = 15_000;
const HTML_BYTE_LIMIT = 1024 * 1024;
const ICON_BYTE_LIMIT = 2 * 1024 * 1024;

function timeoutSignal(milliseconds: number): AbortSignal {
  const controller = new AbortController();

  setTimeout(() => controller.abort(), milliseconds).unref();

  return controller.signal;
}

function isSpent(budget: Budget): boolean {
  return budget.requests > MAX_REQUESTS || budget.deadline.aborted;
}

async function overNetwork<Result>(work: () => Promise<Result>) {
  try {
    return await work();
  } catch (cause) {
    throw new NoBrandError('The site could not be read', { cause });
  }
}

async function readBody(body: AsyncIterable<Uint8Array>, byteLimit: number) {
  const chunks: Uint8Array[] = [];
  let size = 0;

  for await (const chunk of body) {
    chunks.push(chunk);
    size += chunk.byteLength;

    if (size > byteLimit) {
      break;
    }
  }

  return {
    bytes: Buffer.concat(chunks).subarray(0, byteLimit),
    truncated: size > byteLimit,
  };
}

async function readPublic(
  start: URL,
  byteLimit: number,
  site: SiteAccess,
  budget: Budget,
) {
  let url = start;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    budget.requests += 1;

    if (isSpent(budget)) {
      throw new NoBrandError('The lookup ran out of budget');
    }

    const address = await overNetwork(() => publicAddress(url, site.lookup));

    if (!address) {
      throw new NoBrandError(`Not a public HTTPS address: ${url.href}`);
    }

    const finished = new AbortController();
    const signal = AbortSignal.any([
      finished.signal,
      timeoutSignal(REQUEST_TIMEOUT_MS),
      budget.deadline,
    ]);

    try {
      const response = await overNetwork(() =>
        site.request(url, { address, signal }),
      );

      if (response.status >= 300 && response.status < 400) {
        if (!response.location || !URL.canParse(response.location, url)) {
          throw new NoBrandError(`Redirect to nowhere from ${url.href}`);
        }

        url = new URL(response.location, url);
        continue;
      }

      if (response.status < 200 || response.status >= 300) {
        throw new NoBrandError(`Status ${response.status} from ${url.href}`);
      }

      const body = await overNetwork(() => readBody(response.body, byteLimit));

      return { url, contentType: response.contentType, ...body };
    } finally {
      finished.abort();
    }
  }

  throw new NoBrandError(`Too many redirects from ${start.href}`);
}

async function readIcon(
  hrefs: string[],
  page: URL,
  site: SiteAccess,
  budget: Budget,
): Promise<Icon | null> {
  for (const href of hrefs) {
    if (!URL.canParse(href, page)) {
      continue;
    }

    try {
      const icon = await readPublic(
        new URL(href, page),
        ICON_BYTE_LIMIT,
        site,
        budget,
      );
      const contentType = icon.truncated ? null : sniffImageType(icon.bytes);

      if (contentType) {
        return { bytes: icon.bytes, contentType };
      }
    } catch (error) {
      if (!(error instanceof NoBrandError) || isSpent(budget)) {
        throw error;
      }
    }
  }

  return null;
}

export async function readSite(
  host: string,
  site: SiteAccess,
): Promise<{ name: string | null; icon: Icon | null } | null> {
  const budget = { requests: 0, deadline: timeoutSignal(TOTAL_TIMEOUT_MS) };

  try {
    const page = await readPublic(
      new URL(`https://${host}/`),
      HTML_BYTE_LIMIT,
      site,
      budget,
    );

    if (!page.contentType?.startsWith('text/html')) {
      return null;
    }

    const { name, iconHrefs } = parseSite(new TextDecoder().decode(page.bytes));
    const icon = await readIcon(iconHrefs, page.url, site, budget);

    return name || icon ? { name, icon } : null;
  } catch (error) {
    if (error instanceof NoBrandError) {
      return null;
    }

    throw error;
  }
}
