import type { SiteRequest } from './read-site';

import { request } from 'node:https';

export const pinnedRequest: SiteRequest = (url, { address, signal }) =>
  new Promise((resolve, reject) => {
    request(
      url,
      {
        signal,
        headers: { 'user-agent': 'OpenDealbookBot/1.0' },
        lookup: (_hostname, _options, callback) => callback(null, [address]),
      },
      (response) => {
        resolve({
          status: Number(response.statusCode),
          location: response.headers.location,
          contentType: response.headers['content-type'],
          body: response,
        });
      },
    )
      .on('error', reject)
      .end();
  });
