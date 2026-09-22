import pg from 'pg';

const { Pool } = pg;
const TABLE_SQL = `
  create table if not exists interlock_snapshots (
    name text primary key,
    snapshot jsonb not null,
    updated_at timestamptz not null default now()
  )
`;

export function postgresBackendFromEnv(env = process.env, { logger = console } = {}) {
  const rawConnectionString = env.POSTGRES_URL_NON_POOLING || env.POSTGRES_URL || env.POSTGRES_PRISMA_URL;
  const connectionString = typeof rawConnectionString === 'string'
    ? rawConnectionString.replace(/([?&])sslmode=[^&]*/i, '$1').replace(/[?&]$/, '')
    : rawConnectionString;
  if (typeof connectionString !== 'string' || !connectionString.trim()) return null;
  return createPostgresBackend({ connectionString: connectionString.trim(), logger });
}

export function createPostgresBackend({ connectionString, logger = console, pool: suppliedPool } = {}) {
  if (!connectionString) throw new Error('a PostgreSQL connection string is required');
  const pool = suppliedPool ?? new Pool({
    connectionString,
    max: 2,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 2_000,
    ssl: { rejectUnauthorized: false },
  });
  let schemaReady;

  const ensureSchema = async () => {
    if (!schemaReady) {
      schemaReady = pool.query(TABLE_SQL).catch((error) => {
        schemaReady = null;
        throw error;
      });
    }
    await schemaReady;
  };

  return {
    kind: 'supabase-postgres',
    async load(name) {
      try {
        await ensureSchema();
        const result = await pool.query('select snapshot from interlock_snapshots where name = $1', [name]);
        return result.rows[0]?.snapshot ?? null;
      } catch (error) {
        logger.warn?.(`[postgres-store] load(${name}) failed: ${error?.message ?? error}`);
        return null;
      }
    },
    async save(name, snapshot) {
      try {
        await ensureSchema();
        await pool.query(
          `insert into interlock_snapshots (name, snapshot, updated_at)
           values ($1, $2::jsonb, now())
           on conflict (name) do update
           set snapshot = jsonb_set(
             jsonb_set(
               interlock_snapshots.snapshot || excluded.snapshot,
               '{workspaces}',
               coalesce(interlock_snapshots.snapshot->'workspaces', '{}'::jsonb) ||
                 coalesce(excluded.snapshot->'workspaces', '{}'::jsonb),
               true
             ),
             '{users}',
             coalesce(interlock_snapshots.snapshot->'users', '{}'::jsonb) ||
               coalesce(excluded.snapshot->'users', '{}'::jsonb),
             true
           ), updated_at = now()`,
          [name, JSON.stringify(snapshot)],
        );
        return true;
      } catch (error) {
        logger.error?.(`[postgres-store] save(${name}) failed: ${error?.message ?? error}`);
        return false;
      }
    },
  };
}
