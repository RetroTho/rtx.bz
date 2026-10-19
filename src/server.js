import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { createStore } from './store.js';

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const baseUrl = process.env.BASE_URL || `http://localhost:${port}`;
const dbPath = process.env.DATABASE_PATH || fileURLToPath(new URL('../data/links.sqlite', import.meta.url));
const store = createStore(dbPath);
const server = createServer(createApp({ store, baseUrl }));

server.listen(port, host, () => console.log(`rtx.bz is running at ${baseUrl}`));

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => {
    store.close();
    process.exit(0);
  }));
}
