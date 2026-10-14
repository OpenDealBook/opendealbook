import { PNG } from './fake-site';

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getCACertificates, setDefaultCACertificates } from 'node:tls';

const PAGE = `<title>First Bank</title><link rel="icon" href="/icon.png">`;

function selfSignedCertificate(): { key: string; cert: string } {
  const directory = mkdtempSync(join(tmpdir(), 'lender-brand-tls-'));
  const keyPath = join(directory, 'key.pem');
  const certPath = join(directory, 'cert.pem');

  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '2',
      '-subj',
      '/CN=firstbank.test',
      '-addext',
      'subjectAltName=DNS:firstbank.test,DNS:*.firstbank.test',
      '-keyout',
      keyPath,
      '-out',
      certPath,
    ],
    { stdio: 'ignore' },
  );

  const certificate = {
    key: readFileSync(keyPath, 'utf8'),
    cert: readFileSync(certPath, 'utf8'),
  };

  rmSync(directory, { recursive: true });

  return certificate;
}

export async function startTlsSite(): Promise<{
  server: Server;
  port: number;
}> {
  const certificate = selfSignedCertificate();

  setDefaultCACertificates([...getCACertificates('default'), certificate.cert]);

  const server = createServer(certificate, (request, response) => {
    const scenario = request.headers.host?.split('.')[0];
    const target = `${scenario}${request.url}`;

    if (request.url === '/echo') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          host: request.headers.host,
          userAgent: request.headers['user-agent'],
        }),
      );
    } else if (request.url === '/moved') {
      response.writeHead(301, { location: 'https://www.firstbank.test/' });
      response.end();
    } else if (request.url === '/hang') {
      return;
    } else if (
      target === 'stalled-page/' ||
      target === 'stalled-icon/icon.png'
    ) {
      response.writeHead(200, {
        'content-type': request.url === '/' ? 'text/html' : 'image/png',
      });
      response.write(request.url === '/' ? PAGE : PNG);
    } else if (target === 'broken-page/' || target === 'broken-icon/icon.png') {
      response.writeHead(200, {
        'content-type': request.url === '/' ? 'text/html' : 'image/png',
        'content-length': '100000',
      });
      response.write(request.url === '/' ? PAGE : PNG, () =>
        request.socket.destroy(),
      );
    } else if (request.url === '/') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end(PAGE);
    } else if (request.url === '/icon.png') {
      response.writeHead(200, { 'content-type': 'image/png' });
      response.end(PNG);
    } else {
      response.writeHead(404, { 'content-type': 'text/html' });
      response.end('missing');
    }
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  return { server, port: (server.address() as AddressInfo).port };
}
