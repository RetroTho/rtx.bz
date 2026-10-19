const form = document.querySelector('#shorten-form');
const urlInput = document.querySelector('#url');
const shortenButton = document.querySelector('#shorten-button');
const error = document.querySelector('#url-error');
const result = document.querySelector('#result');
const shortUrl = document.querySelector('#short-url');
const copyButton = document.querySelector('#copy-button');
const status = document.querySelector('#status');

let activeRequest = null;
let revision = 0;

function setLoading(loading) {
  shortenButton.disabled = loading;
  shortenButton.textContent = loading ? 'Shortening…' : 'Shorten link ↗';
  form.setAttribute('aria-busy', String(loading));
}

function clearOutput() {
  result.hidden = true;
  shortUrl.value = '';
  error.hidden = true;
  error.textContent = '';
  status.textContent = '';
  copyButton.textContent = 'Copy link';
  urlInput.removeAttribute('aria-invalid');
}

function showError(message) {
  error.textContent = message;
  error.hidden = false;
  urlInput.setAttribute('aria-invalid', 'true');
}

urlInput.addEventListener('input', () => {
  revision += 1;
  activeRequest?.abort();
  activeRequest = null;
  setLoading(false);
  clearOutput();
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const requestRevision = ++revision;
  activeRequest?.abort();
  clearOutput();

  const url = urlInput.value.trim();
  if (!url) {
    setLoading(false);
    showError('Paste a link to get started.');
    urlInput.focus();
    return;
  }

  const controller = new AbortController();
  activeRequest = controller;
  setLoading(true);

  try {
    const response = await fetch('/api/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ url }),
      signal: controller.signal,
    });
    const data = await response.json();
    if (requestRevision !== revision) return;
    if (!response.ok) {
      showError(data.error || 'Could not shorten this link. Please try again.');
      return;
    }
    if (typeof data.shortUrl !== 'string' || !data.shortUrl) {
      throw new Error('Missing short URL');
    }

    shortUrl.value = data.shortUrl;
    result.hidden = false;
    status.textContent = 'Your short link is ready.';
  } catch (requestError) {
    if (requestError.name === 'AbortError' || requestRevision !== revision) return;
    showError('Could not reach the shortener. Please try again.');
  } finally {
    if (requestRevision === revision) {
      activeRequest = null;
      setLoading(false);
    }
  }
});

copyButton.addEventListener('click', async () => {
  const value = shortUrl.value;
  const copyRevision = revision;
  if (!value) return;

  copyButton.textContent = 'Copy link';
  status.textContent = '';

  try {
    await navigator.clipboard.writeText(value);
    if (copyRevision !== revision) return;
    copyButton.textContent = 'Copied';
    status.textContent = 'Link copied to your clipboard.';
  } catch {
    if (copyRevision !== revision) return;
    shortUrl.focus();
    shortUrl.select();
    shortUrl.setSelectionRange(0, value.length);
    status.textContent = 'Could not copy automatically. Link selected—use your device’s copy command.';
  }
});
