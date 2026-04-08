import { net, protocol } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getAssetsRoot } from './assets';

export function registerSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'app',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        corsEnabled: true,
      },
    },
  ]);
}

function resolveAppUrl(url: URL): string | null {
  const host = url.hostname;
  const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, '');

  if (host === 'people') {
    return join(getAssetsRoot(), relativePath);
  }
  return null;
}

export function registerAppProtocolHandler(): void {
  protocol.handle('app', async (request) => {
    const url = new URL(request.url);
    const filePath = resolveAppUrl(url);
    if (!filePath) {
      return new Response('Not found', { status: 404 });
    }
    return net.fetch(pathToFileURL(filePath).toString());
  });
}
