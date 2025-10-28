/**
 * @fileoverview Test setup and global utilities
 * @module tests/setup
 */

import type { Pool } from 'pg';
import type { PostgresContainerManager } from './testcontainers/postgres';

/**
 * Helper to create test logger
 */
export function createTestLogger() {
  return {
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    fatal: () => {},
    child: () => createTestLogger(),
  } as any;
}

/**
 * Mock database pool (for unit tests)
 */
export const mockPool = {
  query: async () => ({ rows: [], rowCount: 0 }),
  connect: async () => ({
    query: async () => ({ rows: [], rowCount: 0 }),
    release: () => {},
  }),
  end: async () => {},
} as any;

/**
 * Global test container instances (for integration tests)
 * These are initialized in beforeAll hooks when needed
 */
export let postgresContainer: PostgresContainerManager | null = null;
export let testPool: Pool | null = null;

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
}

/**
 * Cleanup testcontainer resources
 */
export async function cleanupTestContainers(): Promise<void> {
  if (testPool) {
    await testPool.end();
    testPool = null;
  }

  if (postgresContainer) {
    await postgresContainer.stop();
    postgresContainer = null;
  }
}

