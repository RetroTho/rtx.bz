import { readFile } from 'node:fs/promises';
import { CODE_PATTERN, normalizeUrl, shorten } from './links.js';
import { createRateLimiter } from './rate-limit.js';

const PUBLIC_DIR = new URL('../public/', import.meta.url);
const ASSETS = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/theme.js': ['theme.js', 'text/javascript; charset=utf-8'],
  '/favicon.svg': ['favicon.svg', 'image/svg+xml'],
};
const HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};

function send(response, status, body, headers = {}) {
  response.writeHead(status, { ...HEADERS, 'Content-Type': 'text/plain; charset=utf-8', ...headers });
  response.end(body);
}

function json(response, status, data, headers = {}) {
  send(response, status, JSON.stringify(data), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers });
}

async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > 16384) {
      request.resume();
      throw new Error('That URL is too long.', { cause: 413 });
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('Send a valid JSON URL.', { cause: 400 });
  }
}

export function createApp({ store, baseUrl, rateLimit = createRateLimiter() }) {
  const origin = new URL(baseUrl).origin;

  return async (request, response) => {
    try {
      const { pathname } = new URL(request.url, origin);

      if (pathname === '/api/links') {
        if (request.method !== 'POST') return send(response, 405, 'Method not allowed.', { Allow: 'POST' });
        if (request.headers.origin && request.headers.origin !== origin) {
          return json(response, 403, { error: 'Request origin is not allowed.' });
        }
        if (request.headers['content-type']?.split(';')[0].trim() !== 'application/json') {
          return json(response, 415, { error: 'Send the URL as JSON.' });
        }
        const retryAfter = rateLimit();
        if (retryAfter > 0) {
          request.resume();
          return json(response, 429, { error: 'Too many requests. Please try again shortly.' }, { 'Retry-After': String(retryAfter) });
        }
        const body = await readJson(request);
        let url;
        try {
          url = normalizeUrl(body?.url, [origin, 'https://rtx.bz']);
        } catch (error) {
          return json(response, 400, { error: error.message });
        }
        const code = shorten(store, url);
        return json(response, 201, { shortUrl: `${origin}/${code}` });
      }

      if (!['GET', 'HEAD'].includes(request.method)) {
        return send(response, 405, 'Method not allowed.', { Allow: 'GET, HEAD' });
      }
      const isHead = request.method === 'HEAD';
      if (CODE_PATTERN.test(pathname.slice(1))) {
        const url = store.findUrl(pathname.slice(1));
        if (url) return send(response, 302, null, { Location: url, 'Cache-Control': 'no-store' });
        return send(response, 404, isHead ? null : 'This short link does not exist.');
      }

      const asset = Object.hasOwn(ASSETS, pathname) ? ASSETS[pathname] : null;
      if (asset) {
        const [file, type] = asset;
        const content = await readFile(new URL(file, PUBLIC_DIR));
        return send(response, 200, isHead ? null : content, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
      }
      return send(response, 404, isHead ? null : 'Not found.');
    } catch (error) {
      const status = error.cause === 400 || error.cause === 413 ? error.cause : 500;
      if (status === 500) console.error('Request failed:', error);
      json(response, status, { error: status === 500 ? 'Something went wrong. Please try again.' : error.message });
    }
  };
}
