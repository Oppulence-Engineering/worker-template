/**
 * @fileoverview Redis testcontainer implementation
 * @module tests/testcontainers/redis
 */

import { GenericContainer, type StartedTestContainer } from 'testcontainers';

import { BaseContainerManager, type ContainerConfig } from './base';

/**
 * Redis connection details
 */
export interface RedisConnection {
  host: string;
  port: number;
  password?: string;
  db: number;
}

/**
 * Redis configuration
 */
export interface RedisConfig {
  password?: string;
  db?: number;
  maxMemory?: string;
  maxMemoryPolicy?: string;
}

/**
 * Redis container manager with full type safety
 *
 * @example
 * ```typescript
 * const redis = new RedisContainerManager({
 *   image: 'redis:7-alpine',
 *   ports: [6379],
 *   config: {
 *     password: 'secret',
 *     db: 0,
 *   },
 * });
 *
 * await redis.start();
 * const url = redis.getConnectionString();
 * // redis://:secret@localhost:6379/0
 * await redis.stop();
 * ```
 */
export class RedisContainerManager extends BaseContainerManager<
  StartedTestContainer,
  RedisConnection,
  RedisConfig
> {
  /**
   * Start Redis container
   */
  protected async startContainer(): Promise<StartedTestContainer> {
    const {
      password,
      maxMemory = '256mb',
      maxMemoryPolicy = 'allkeys-lru',
    } = this.config.config || {};

    let container = new GenericContainer(this.config.image).withExposedPorts(...this.config.ports);

    // Build Redis command with options
    const command = ['redis-server'];

    if (password) {
      command.push('--requirepass', password);
    }

    command.push('--maxmemory', maxMemory);
    command.push('--maxmemory-policy', maxMemoryPolicy);
    command.push('--appendonly', 'yes');

    container = container.withCommand(command);

    // Add environment variables if provided
    if (this.config.env) {
      Object.entries(this.config.env).forEach(([key, value]) => {
        container = container.withEnvironment({ [key]: value });
      });
    }

    return await container.start();
  }

  /**
   * Create connection details
   */
  protected createConnection(container: StartedTestContainer): RedisConnection {
    const { password, db = 0 } = this.config.config || {};

    return {
      host: container.getHost(),
      port: container.getMappedPort(this.config.ports[0] ?? 6379),
      password,
      db,
    };
  }

  /**
   * Get Redis connection string
   */
  getConnectionString(): string {
    const conn = this.connection;
    const auth = conn.password ? `:${conn.password}@` : '';
    return `redis://${auth}${conn.host}:${conn.port}/${conn.db}`;
  }

  /**
   * Health check - ping Redis
   */
  async isHealthy(): Promise<boolean> {
    try {
      const result = await this.exec(['redis-cli', 'ping']);
      return result.output.trim() === 'PONG';
    } catch {
      return false;
    }
  }

  /**
   * Execute Redis command
   */
  async executeCommand(command: string[]): Promise<string> {
    const { password } = this.config.config || {};
    const cmd = password ? ['redis-cli', '-a', password, ...command] : ['redis-cli', ...command];

    const result = await this.exec(cmd);
    return result.output.trim();
  }

  /**
   * Flush all data
   */
  async flushAll(): Promise<void> {
    await this.executeCommand(['FLUSHALL']);
  }

  /**
   * Get Redis info
   */
  async getInfo(section?: string): Promise<string> {
    const cmd = section ? ['INFO', section] : ['INFO'];
    return await this.executeCommand(cmd);
  }
}

/**
 * Factory function for creating Redis containers
 */
export function createRedisContainer(
  config?: Partial<ContainerConfig<RedisConfig>>
): RedisContainerManager {
  return new RedisContainerManager({
    image: 'redis:7-alpine',
    ports: [6379],
    ...config,
  });
}
