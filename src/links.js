const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_-';
export const CODE_PATTERN = /^[a-zA-Z0-9_-]{5}$/;

export function normalizeUrl(value, ownOrigins = []) {
  if (typeof value !== 'string' || !value.trim() || value.length > 8192) {
    throw new Error('Enter a URL of 8,192 characters or fewer.');
  }

  let input = value.trim();
  const hostWithPort = /^(?:[^/?#:]+\.[^/?#:]+|localhost|\[[\da-f:]+\]):\d+(?:[/?#]|$)/i.test(input);
  if (input.startsWith('//')) input = `https:${input}`;
  else if (hostWithPort || !/^[a-z][a-z0-9+.-]*:/i.test(input)) input = `https://${input}`;

  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error('Enter a valid website URL.');
  }

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Use an http or https website URL without a username or password.');
  }
  // Avoid redirect chains and loops back into this shortener.
  if (ownOrigins.some(origin => new URL(origin).hostname === url.hostname)) {
    throw new Error('This is already a short link. Paste the original URL instead.');
  }
  return url.href;
}

export function generateCode() {
  return Array.from(crypto.getRandomValues(new Uint8Array(5)), byte => ALPHABET[byte & 63]).join('');
}

export function shorten(store, url, makeCode = generateCode) {
  // Unique constraints handle simultaneous requests and the occasional random collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeCode();
    store.insert(code, url);
    const existing = store.findCode(url);
    if (existing) return existing;
  }
  throw new Error('Could not allocate a short code.');
}
