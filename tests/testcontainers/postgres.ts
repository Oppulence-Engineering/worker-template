/**
 * @fileoverview PostgreSQL testcontainer implementation
 * @module tests/testcontainers/postgres
 */

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool, type PoolConfig } from 'pg';

import { BaseContainerManager, type ContainerConfig } from './base';

/**
 * PostgreSQL connection details
 */
export interface PostgresConnection {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
}

/**
 * PostgreSQL configuration
 */
export interface PostgresConfig {
  database?: string;
  username?: string;
  password?: string;
  initScripts?: string[];
}

/**
 * PostgreSQL container manager with full type safety
 *
 * @example
 * ```typescript
 * const postgres = new PostgresContainerManager({
 *   image: 'postgres:16-alpine',
 *   ports: [5432],
 *   config: {
 *     database: 'test_db',
 *     username: 'test_user',
 *     password: 'test_pass',
 *   },
 * });
 *
 * await postgres.start();
 * const pool = postgres.createPool();
 * await pool.query('SELECT NOW()');
 * await postgres.stop();
 * ```
 */
export class PostgresContainerManager extends BaseContainerManager<
  StartedPostgreSqlContainer,
  PostgresConnection,
  PostgresConfig
> {
  private pool: Pool | null = null;

  /**
   * Start PostgreSQL container
   */
  protected async startContainer(): Promise<StartedPostgreSqlContainer> {
    const {
      database = 'test_db',
      username = 'test_user',
      password = 'test_pass',
    } = this.config.config || {};

    let container = new PostgreSqlContainer(this.config.image)
      .withDatabase(database)
      .withUsername(username)
      .withPassword(password);

    // Add init scripts if provided
    if (this.config.config?.initScripts) {
      for (const script of this.config.config.initScripts) {
        container = container.withCopyFilesToContainer([
          {
            source: script,
            target: `/docker-entrypoint-initdb.d/${script}`,
          },
        ]);
      }
    }

    return await container.start();
  }

  /**
   * Create connection details
   */
  protected createConnection(container: StartedPostgreSqlContainer): PostgresConnection {
    return {
      host: container.getHost(),
      port: container.getPort(),
      database: container.getDatabase(),
      username: container.getUsername(),
      password: container.getPassword(),
      ssl: false,
    };
  }

  /**
   * Get PostgreSQL connection string
   */
  getConnectionString(): string {
    const conn = this.connection;
    return `postgresql://${conn.username}:${conn.password}@${conn.host}:${conn.port}/${conn.database}`;
  }

  /**
   * Create a connection pool
   */
  createPool(config?: Partial<PoolConfig>): Pool {
    if (this.pool) {
      return this.pool;
    }

    const conn = this.connection;
    this.pool = new Pool({
      host: conn.host,
      port: conn.port,
      database: conn.database,
      user: conn.username,
      password: conn.password,
      ssl: conn.ssl,
      ...config,
    });

    return this.pool;
  }

  /**
   * Get the connection pool
   */
  getPool(): Pool {
    if (!this.pool) {
      throw new Error('Pool not created. Call createPool() first.');
    }
    return this.pool;
  }

  /**
   * Health check - verify database connection
   */
  async isHealthy(): Promise<boolean> {
    try {
      const pool = this.pool || this.createPool();
      const result = await pool.query('SELECT 1');
      return result.rows.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Execute SQL script
   */
  async executeScript(sql: string): Promise<void> {
    const pool = this.pool || this.createPool();
    await pool.query(sql);
  }

  /**
   * Stop container and cleanup pool
   */
  async stop(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
    await super.stop();
  }
}

/**
 * Factory function for creating PostgreSQL containers
 */
export function createPostgresContainer(
  config?: Partial<ContainerConfig<PostgresConfig>>
): PostgresContainerManager {
  return new PostgresContainerManager({
    image: 'postgres:16-alpine',
    ports: [5432],
    ...config,
  });
}
