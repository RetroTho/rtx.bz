import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { createStore } from '../src/store.js';
import { normalizeUrl, shorten } from '../src/links.js';
import { createRateLimiter } from '../src/rate-limit.js';

async function setup(t, options = {}) {
  const store = createStore(':memory:');
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  server.on('request', createApp({ store, baseUrl: origin, ...options }));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    store.close();
  });
  const post = (url, options = {}) => fetch(`${origin}/api/links`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }), ...options,
  });
  return { store, origin, post };
}

test('create, reuse, and publicly redirect a short link', async t => {
  const { origin, post } = await setup(t);
  const target = 'https://example.com/a?one=1&two=2#section';
  const created = await post(target);
  assert.equal(created.status, 201);
  const { shortUrl } = await created.json();
  assert.match(shortUrl, new RegExp(`^${origin}/[a-zA-Z0-9_-]{5}$`));
  assert.deepEqual(await (await post(target)).json(), { shortUrl });
  for (const method of ['GET', 'HEAD']) {
    const redirect = await fetch(shortUrl, { method, redirect: 'manual' });
    assert.equal(redirect.status, 302);
    assert.equal(redirect.headers.get('location'), target);
  }
});

test('normalize pasted URLs and reject unsafe or recursive URLs', async t => {
  const { post, origin } = await setup(t);
  assert.equal(normalizeUrl(' example.com/path '), 'https://example.com/path');
  assert.equal(normalizeUrl('example.com:8080/path'), 'https://example.com:8080/path');
  assert.equal(normalizeUrl('https://[2001:db8::1]/path'), 'https://[2001:db8::1]/path');
  assert.equal(normalizeUrl('//example.com/path'), 'https://example.com/path');
  for (const url of ['', null, 'not a url', 'javascript:alert(1)', 'data:text/html,test', 'ftp://example.com', 'https://user:pass@example.com', 'https://rtx.bz/abcde', `${origin}/abcde`]) {
    const response = await post(url);
    assert.equal(response.status, 400, String(url));
    assert.equal(typeof (await response.json()).error, 'string');
  }
});

test('handle malformed, oversized, cross-origin, and wrong-method requests', async t => {
  const { post, origin } = await setup(t);
  assert.equal((await post(null, { body: '{' })).status, 400);
  assert.equal((await post('https://example.com/' + 'a'.repeat(17000))).status, 413);
  assert.equal((await post('https://example.com', { headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await post('https://example.com', { headers: { 'Content-Type': 'application/json', Origin: 'https://other.example' } })).status, 403);
  assert.equal((await fetch(`${origin}/api/links`)).status, 405);
  assert.equal((await fetch(`${origin}/zzzzz`)).status, 404);
  assert.equal((await fetch(`${origin}/missing/path`)).status, 404);
  assert.equal((await fetch(`${origin}/package.json`)).status, 404);
});

test('serve only public assets with browser security headers', async t => {
  const { origin } = await setup(t);
  for (const path of ['/', '/app.js', '/theme.js', '/styles.css', '/favicon.svg']) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(response.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
  }
});

test('retry code collisions without replacing another destination', () => {
  const store = createStore(':memory:');
  try {
    store.insert('abcde', 'https://example.com/first');
    const candidates = ['abcde', 'fghij'];
    assert.equal(shorten(store, 'https://example.com/second', () => candidates.shift()), 'fghij');
    assert.equal(store.findUrl('abcde'), 'https://example.com/first');
    assert.throws(() => shorten(store, 'https://example.com/third', () => 'abcde'));
  } finally {
    store.close();
  }
});

test('saved links survive closing and reopening the database', () => {
  const directory = mkdtempSync(join(tmpdir(), 'rtxbz-test-'));
  const filename = join(directory, 'links.sqlite');
  try {
    let store = createStore(filename);
    const code = shorten(store, 'https://example.com/persisted');
    store.close();
    store = createStore(filename);
    assert.equal(store.findUrl(code), 'https://example.com/persisted');
    store.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('limit creation requests while keeping redirects and public assets unrestricted', async t => {
  let time = 0;
  const rateLimit = createRateLimiter({ limit: 2, now: () => time });
  const { origin, post } = await setup(t, { rateLimit });
  const { shortUrl } = await (await post('https://example.com/limited')).json();
  assert.equal((await post(null, { body: '{' })).status, 400);

  const blocked = await post('https://example.com/another');
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get('retry-after'), '60');
  assert.equal(blocked.headers.get('cache-control'), 'no-store');
  assert.equal(typeof (await blocked.json()).error, 'string');

  for (let i = 0; i < 5; i += 1) {
    for (const method of ['GET', 'HEAD']) {
      const response = await fetch(shortUrl, { method, redirect: 'manual' });
      assert.equal(response.status, 302);
      assert.equal(response.headers.get('location'), 'https://example.com/limited');
    }
  }
  assert.equal((await fetch(origin)).status, 200);
  assert.equal((await fetch(`${origin}/api/links`)).status, 405);

  time = 59_001;
  assert.equal((await post('https://example.com/another')).headers.get('retry-after'), '1');
  time = 60_000;
  assert.equal((await post('https://example.com/another')).status, 201);
  assert.equal((await post('https://example.com/third')).status, 201);
  assert.equal((await post('https://example.com/fourth')).status, 429);
});

test('share the creation limit across simultaneous requests', async t => {
  const rateLimit = createRateLimiter({ limit: 3 });
  const { post } = await setup(t, { rateLimit });
  const responses = await Promise.all(Array.from({ length: 10 }, (_, i) => post(`https://example.com/${i}`)));
  assert.equal(responses.filter(response => response.status === 201).length, 3);
  assert.equal(responses.filter(response => response.status === 429).length, 7);
});
