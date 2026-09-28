import { makeRouteHandler } from '@keystatic/next/route-handler';

import { keystaticConfig } from '@odb/keystatic';

export const { POST, GET } = makeRouteHandler({ config: keystaticConfig });
