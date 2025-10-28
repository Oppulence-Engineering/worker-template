/**
 * @fileoverview Test setup and global utilities
 * @module tests/setup
 */

import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { DataType } from 'pg-mem';
import type { PostgresContainerManager } from './testcontainers/postgres';

type PgMemPool = Pool & { end: () => Promise<void> };

/**
 * Helper to create test logger
 */
type TestLogger = {
  trace: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  fatal: (...args: unknown[]) => void;
  child: () => TestLogger;
};

export function createTestLogger(): TestLogger {
  const logger: TestLogger = {
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    fatal: () => {},
    child: () => createTestLogger(),
  };

  return logger;
}

/**
 * Mock database pool (for unit tests)
 */
interface MockPoolClient {
  query: (queryText: string, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
  release: () => void;
}

interface MockPool {
  query: (queryText: string, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
  connect: () => Promise<MockPoolClient>;
  end: () => Promise<void>;
}

export const mockPool: MockPool = {
  query: async () => ({ rows: [], rowCount: 0 }),
  connect: async () => ({
    query: async () => ({ rows: [], rowCount: 0 }),
    release: () => {},
  }),
  end: async () => {},
};

/**
 * Global test container instances (for integration tests)
 * These are initialized in beforeAll hooks when needed
 */
export let postgresContainer: PostgresContainerManager | null = null;
export let testPool: Pool | null = null;

let pgMemPool: PgMemPool | null = null;
let usingTestcontainers = false;

/**
 * Initialize PostgreSQL testcontainer for integration tests
 *
 * @example
 * ```typescript
 * import { initializePostgresContainer, postgresContainer, testPool } from '../setup';
 *
 * beforeAll(async () => {
 *   await initializePostgresContainer();
 * }, 60000);
 *
 * afterAll(async () => {
 *   await postgresContainer?.stop();
 * });
 * ```
 */
export async function initializePostgresContainer(): Promise<void> {
  if (testPool) {
    return;
  }

  usingTestcontainers = process.env.USE_TESTCONTAINERS === 'true';

  if (usingTestcontainers) {
    const { createPostgresContainer } = await import('./testcontainers/postgres');

    postgresContainer = createPostgresContainer({
      config: {
        database: 'test_db',
        username: 'test_user',
        password: 'test_pass',
      },
    });

    await postgresContainer.start();
    testPool = postgresContainer.createPool();
    return;
  }

  const { newDb } = await import('pg-mem');
  const db = newDb({ autoCreateForeignKeyIndices: true });

  db.public.registerFunction({
    name: 'gen_random_uuid',
    returns: DataType.uuid,
    implementation: () => randomUUID(),
    impure: true,
  });

  const adapter = db.adapters.createPg();
  pgMemPool = new adapter.Pool() as unknown as PgMemPool;
  testPool = pgMemPool;
}

/**
 * Cleanup testcontainer resources
 */
export async function cleanupTestContainers(): Promise<void> {
  if (testPool) {
    await testPool.end();
    testPool = null;
  }

  if (usingTestcontainers && postgresContainer) {
    await postgresContainer.stop();
    postgresContainer = null;
  }

  if (pgMemPool) {
    pgMemPool = null;
  }

  usingTestcontainers = false;
}
