/**
 * @fileoverview Testcontainers module exports
 * @module tests/testcontainers
 *
 * Generic testcontainer system for provisioning any type of Docker container in tests.
 *
 * @example
 * ```typescript
 * import { createPostgresContainer, createRedisContainer } from './testcontainers';
 *
 * const postgres = createPostgresContainer();
 * await postgres.start();
 * const pool = postgres.createPool();
 * ```
 */

// Base system
export {
  BaseContainerManager,
  ContainerRegistry,
  createContainerRegistry,
  type ContainerConfig,
  type IContainerInstance,
} from './base';

// PostgreSQL
export {
  PostgresContainerManager,
  createPostgresContainer,
  type PostgresConnection,
  type PostgresConfig,
} from './postgres';

// Redis
export {
  RedisContainerManager,
  createRedisContainer,
  type RedisConnection,
  type RedisConfig,
} from './redis';

// Generic containers
export {
  GenericContainerManager,
  createGenericContainer,
  createRabbitMQContainer,
  createElasticsearchContainer,
  createMinIOContainer,
  createLocalstackContainer,
  type GenericConnection,
  type GenericConfig,
} from './generic';
