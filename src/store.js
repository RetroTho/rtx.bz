import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function createStore(filename) {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS links (
      code TEXT PRIMARY KEY,
      url TEXT NOT NULL UNIQUE
    );
  `);
  const insert = db.prepare('INSERT INTO links (code, url) VALUES (?, ?) ON CONFLICT DO NOTHING');
  const byUrl = db.prepare('SELECT code FROM links WHERE url = ?');
  const byCode = db.prepare('SELECT url FROM links WHERE code = ?');

  return {
    insert: (code, url) => insert.run(code, url),
    findCode: url => byUrl.get(url)?.code,
    findUrl: code => byCode.get(code)?.url,
    close: () => db.close(),
  };
}
