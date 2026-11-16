import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let pgliteInstance: PGlite | null = null;

export async function getDb(): Promise<PGlite> {
  if (!pgliteInstance) {
    const dataDir = process.env.DATABASE_DIR || path.resolve(__dirname, '../../../.data/pglite');
    fs.mkdirSync(dataDir, { recursive: true });
    pgliteInstance = new PGlite(dataDir);
    await initDb(pgliteInstance);
  }
  return pgliteInstance;
}

export async function getTestDb(): Promise<PGlite> {
  // Fresh in-memory instance for testing
  const testDb = new PGlite();
  await initDb(testDb);
  return testDb;
}

export async function initDb(db: PGlite): Promise<void> {
  const migrationPath = path.resolve(__dirname, '../../../migrations/0001_initial_schema.sql');
  if (fs.existsSync(migrationPath)) {
    const migrationSql = fs.readFileSync(migrationPath, 'utf8');
    await db.exec(migrationSql);
  } else {
    throw new Error(`Migration file not found at ${migrationPath}`);
  }
}

export async function query<T = any>(sql: string, params: any[] = []): Promise<{ rows: T[]; rowCount: number }> {
  const db = await getDb();
  const result = await db.query<T>(sql, params);
  return {
    rows: result.rows,
    rowCount: result.rows.length
  };
}
