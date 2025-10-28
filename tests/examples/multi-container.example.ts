/**
 * @fileoverview Example of using multiple testcontainers in integration tests
 * @module tests/examples/multi-container
 *
 * This example demonstrates:
 * - Using multiple containers (PostgreSQL + Redis)
 * - Type-safe container registry
 * - Parallel container startup
 * - Cross-container operations
 * - Proper cleanup
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import {
  createContainerRegistry,
  createPostgresContainer,
  createRedisContainer,
  type PostgresContainerManager,
  type RedisContainerManager,
} from '../testcontainers';
import type { Pool } from 'pg';

// Skip this example test by default (requires Docker)
const shouldSkip = process.env.RUN_EXAMPLES !== 'true';
const describeExample = shouldSkip ? describe.skip : describe;

// Define our container types
type TestContainers = {
  postgres: PostgresContainerManager;
  redis: RedisContainerManager;
};

describeExample('example: Multi-container Integration', () => {
  const registry = createContainerRegistry<TestContainers>();
  let pgPool: Pool;

  beforeAll(async () => {
    console.log('Starting multi-container environment...');

    // Register containers
    registry.register('postgres', createPostgresContainer({
      config: {
        database: 'integration_test',
        username: 'test_user',
        password: 'test_pass',
      },
    }));

    registry.register('redis', createRedisContainer({
      config: {
        password: 'redis_secret',
        maxMemory: '128mb',
      },
    }));

    // Start all containers in parallel
    await registry.startAll();

    // Get container instances
    const postgres = registry.get('postgres');
    pgPool = postgres.createPool();

    // Setup database schema
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) NOT NULL UNIQUE,
        email VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    console.log('Multi-container environment ready!');
  }, 90000); // 90 second timeout for multiple containers

  afterAll(async () => {
    if (pgPool) {
      await pgPool.end();
    }
    await registry.stopAll();
    console.log('Cleanup complete');
  }, 30000);

  it('should have all containers running', () => {
    expect(registry.size).toBe(2);
    expect(registry.has('postgres')).toBe(true);
    expect(registry.has('redis')).toBe(true);
  });

  it('should perform database operations', async () => {
    const result = await pgPool.query(
      'INSERT INTO users (username, email) VALUES ($1, $2) RETURNING *',
      ['testuser', 'test@example.com']
    );

    expect(result.rows[0]).toBeDefined();
    expect(result.rows[0].username).toBe('testuser');
    expect(result.rows[0].email).toBe('test@example.com');
  });

  it('should perform Redis operations', async () => {
    const redis = registry.get('redis');

    // Set a value
    await redis.executeCommand(['SET', 'test:key', 'test-value']);

    // Get the value
    const value = await redis.executeCommand(['GET', 'test:key']);
    expect(value).toBe('test-value');

    // Set with expiry
    await redis.executeCommand(['SETEX', 'test:expiry', '60', 'will-expire']);
    const ttl = await redis.executeCommand(['TTL', 'test:expiry']);
    expect(parseInt(ttl)).toBeGreaterThan(0);
  });

  it('should demonstrate cross-container workflow', async () => {
    // 1. Store user in PostgreSQL
    const userResult = await pgPool.query(
      'INSERT INTO users (username, email) VALUES ($1, $2) RETURNING *',
      ['cacheuser', 'cache@example.com']
    );
    const userId = userResult.rows[0].id;

    // 2. Cache user data in Redis
    const redis = registry.get('redis');
    const cacheKey = `user:${userId}`;
    const userData = JSON.stringify(userResult.rows[0]);
    await redis.executeCommand(['SETEX', cacheKey, '3600', userData]);

    // 3. Retrieve from cache
    const cachedData = await redis.executeCommand(['GET', cacheKey]);
    const cachedUser = JSON.parse(cachedData);

    expect(cachedUser.username).toBe('cacheuser');
    expect(cachedUser.id).toBe(userId);

    // 4. Verify database and cache are in sync
    const dbResult = await pgPool.query('SELECT * FROM users WHERE id = $1', [userId]);
    expect(dbResult.rows[0].username).toBe(cachedUser.username);
  });

  it('should handle cache invalidation pattern', async () => {
    const redis = registry.get('redis');

    // Create user and cache
    const result = await pgPool.query(
      'INSERT INTO users (username, email) VALUES ($1, $2) RETURNING *',
      ['invalidateuser', 'invalidate@example.com']
    );
    const userId = result.rows[0].id;
    const cacheKey = `user:${userId}`;

    await redis.executeCommand(['SET', cacheKey, JSON.stringify(result.rows[0])]);

    // Update user in database
    await pgPool.query(
      'UPDATE users SET email = $1 WHERE id = $2',
      ['newemail@example.com', userId]
    );

    // Invalidate cache
    await redis.executeCommand(['DEL', cacheKey]);

    // Verify cache is empty
    const cached = await redis.executeCommand(['GET', cacheKey]);
    expect(cached).toBeNull();

    // Re-cache fresh data
    const freshData = await pgPool.query('SELECT * FROM users WHERE id = $1', [userId]);
    await redis.executeCommand(['SET', cacheKey, JSON.stringify(freshData.rows[0])]);

    const newCached = await redis.executeCommand(['GET', cacheKey]);
    const parsedData = JSON.parse(newCached);
    expect(parsedData.email).toBe('newemail@example.com');
  });

  it('should demonstrate connection string usage', () => {
    const postgres = registry.get('postgres');
    const redis = registry.get('redis');

    const pgUrl = postgres.getConnectionString();
    const redisUrl = redis.getConnectionString();

    expect(pgUrl).toContain('postgresql://');
    expect(pgUrl).toContain('integration_test');

    expect(redisUrl).toContain('redis://');
    expect(redisUrl).toContain('redis_secret');
  });

  it('should verify container health', async () => {
    const postgres = registry.get('postgres');
    const redis = registry.get('redis');

    const pgHealthy = await postgres.isHealthy();
    const redisHealthy = await redis.isHealthy();

    expect(pgHealthy).toBe(true);
    expect(redisHealthy).toBe(true);
  });
});

/**
 * Example: Using generic containers for custom services
 */
describeExample('example: Generic Containers', () => {
  it('should show how to use RabbitMQ container', async () => {
    const { createRabbitMQContainer } = await import('../testcontainers/generic');

    const rabbitmq = createRabbitMQContainer();
    await rabbitmq.start();

    try {
      // Get connection details
      const amqpPort = rabbitmq.getPort(5672);
      const managementPort = rabbitmq.getPort(15672);

      expect(amqpPort).toBeGreaterThan(0);
      expect(managementPort).toBeGreaterThan(0);

      // Get URLs
      const amqpUrl = rabbitmq.getUrl(5672, 'amqp');
      const httpUrl = rabbitmq.getUrl(15672, 'http');

      expect(amqpUrl).toContain('amqp://');
      expect(httpUrl).toContain('http://');
    } finally {
      await rabbitmq.stop();
    }
  }, 60000);

  it('should show how to use Elasticsearch container', async () => {
    const { createElasticsearchContainer } = await import('../testcontainers/generic');

    const elasticsearch = createElasticsearchContainer();
    await elasticsearch.start();

    try {
      const httpPort = elasticsearch.getPort(9200);
      const transportPort = elasticsearch.getPort(9300);

      expect(httpPort).toBeGreaterThan(0);
      expect(transportPort).toBeGreaterThan(0);

      const esUrl = elasticsearch.getUrl(9200);
      expect(esUrl).toContain('http://');
    } finally {
      await elasticsearch.stop();
    }
  }, 90000); // Elasticsearch takes longer to start

  it('should show how to use MinIO (S3) container', async () => {
    const { createMinIOContainer } = await import('../testcontainers/generic');

    const minio = createMinIOContainer();
    await minio.start();

    try {
      const apiPort = minio.getPort(9000);
      const consolePort = minio.getPort(9001);

      expect(apiPort).toBeGreaterThan(0);
      expect(consolePort).toBeGreaterThan(0);

      const s3Endpoint = minio.getUrl(9000);
      expect(s3Endpoint).toContain('http://');

      // Could configure AWS SDK here with endpoint
      // const s3Client = new S3Client({ endpoint: s3Endpoint, ... });
    } finally {
      await minio.stop();
    }
  }, 60000);
});

/**
 * To run these examples:
 *
 * RUN_EXAMPLES=true bun test tests/examples/multi-container.example.ts
 */
