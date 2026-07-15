import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DATA_DIRECTORY = join(process.cwd(), 'data');
const DATABASE_PATH = join(DATA_DIRECTORY, 'pank.sqlite');

mkdirSync(DATA_DIRECTORY, { recursive: true });

const database = new DatabaseSync(DATABASE_PATH);

database.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
`);

export function getDatabase() {
  return database;
}

export function closeDatabase() {
  database.close();
}
