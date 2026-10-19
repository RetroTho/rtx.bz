# rtx.bz

A small, public link shortener. Paste a URL, shorten it, copy the result.

Plain HTML, CSS, and JavaScript on the frontend; Node.js and SQLite on the backend. No dependencies, accounts, build step, or external services.

## Run locally

Use Node.js 22.13 or newer (Node 24 LTS recommended).

```sh
npm start
```

Open http://localhost:3000. No `npm install` is needed. Use `npm run dev` to restart automatically when server files change, and `npm test` to run the tests.

Links are stored in `data/links.sqlite` and survive restarts. The database is created automatically and excluded from Git. Keep this data directory when moving or updating the app.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `HOST` | `127.0.0.1` | Listening address |
| `BASE_URL` | `http://localhost:<PORT>` | Public origin used for generated links |
| `DATABASE_PATH` | `data/links.sqlite` | SQLite file location |

## Rate limiting

Link creation is limited to 30 requests per 60-second window, shared across all
visitors. The window starts with the first request. Invalid submissions and
requests for an existing URL also count. Excess requests receive HTTP 429 with a
`Retry-After` header and a message shown by the page. Redirects and static files
are unrestricted.

The limit uses one in-memory counter per app instance and resets on restart. It
does not store IP addresses or visitor identifiers. Limits are independent if
you run multiple app instances. Defaults are defined in `src/rate-limit.js`.

## Structure

- `public/` — the page, styles, and browser interactions.
- `src/app.js` — HTTP routes, input handling, and static files.
- `src/links.js` — URL validation and five-character random codes.
- `src/rate-limit.js` — shared in-memory limit for link creation.
- `src/store.js` — SQLite persistence.
- `src/server.js` — configuration and server startup.
- `test/app.test.js` — API, redirect, collision, and persistence tests.

`POST /api/links` accepts `{ "url": "https://example.com" }` and returns `{ "shortUrl": "http://localhost:3000/abcde" }`. A missing scheme becomes HTTPS. Repeated URLs reuse their existing code. `GET /:code` returns a 302 redirect; unknown codes return 404. Only HTTP and HTTPS destinations are accepted. Submitted URLs are not fetched by the server.
