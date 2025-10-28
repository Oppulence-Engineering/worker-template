# Generic Testcontainer System

## Overview

The Graphile Worker Template includes a comprehensive **generic testcontainer system** built with extensive TypeScript generics. This system allows you to provision and manage any type of Docker container for integration testing with full type safety.

## Architecture

### Core Components

```
tests/testcontainers/
├── base.ts                 # Generic base system (300+ lines)
│   ├── BaseContainerManager<TContainer, TConnection, TConfig>
│   ├── ContainerRegistry<TContainers>
│   └── IContainerInstance interface
├── postgres.ts             # PostgreSQL-specific implementation
├── redis.ts                # Redis-specific implementation
├── generic.ts              # Generic container + predefined factories
└── index.ts                # Centralized exports
```

### Type System

The system uses **three levels of generic type parameters**:

```typescript
abstract class BaseContainerManager<
  TContainer extends StartedTestContainer,  // Container instance type
  TConnection = unknown,                     // Connection details type
  TConfig = Record<string, unknown>          // Configuration type
>
```

This enables:
- ✅ **Type-safe connection details** - Strongly typed host, port, credentials
- ✅ **Type-safe configuration** - Zod-validated container config
- ✅ **Type-safe registry** - Typed container lookup with intellisense
- ✅ **Full generic inference** - TypeScript infers all types automatically

## Features

### 1. Base Container Manager

Abstract base class for all container implementations:

```typescript
import { BaseContainerManager, type ContainerConfig } from './testcontainers/base';

class MyContainerManager extends BaseContainerManager<
  StartedTestContainer,
  MyConnection,
  MyConfig
> {
  protected async startContainer(): Promise<StartedTestContainer> {
    // Container startup logic
  }

  protected createConnection(container: StartedTestContainer): MyConnection {
    // Extract connection details
  }

  getConnectionString(): string {
    // Return connection URL
  }
}
```

**Provided Methods:**
- `start()` - Start container and initialize connection
- `stop()` - Stop and cleanup container
- `exec(command: string[])` - Execute command in container
- `getLogs()` - Get container logs
- `isHealthy()` - Health check
- `getConnectionString()` - Connection URL (abstract)

### 2. Container Registry

Type-safe registry for managing multiple containers:

```typescript
import { createContainerRegistry } from './testcontainers/base';

type Containers = {
  postgres: PostgresContainerManager;
  redis: RedisContainerManager;
  rabbitmq: GenericContainerManager;
};

const registry = createContainerRegistry<Containers>();

registry.register('postgres', createPostgresContainer());
registry.register('redis', createRedisContainer());
registry.register('rabbitmq', createRabbitMQContainer());

// Start all in parallel
await registry.startAll();

// Type-safe access
const postgres = registry.get('postgres'); // Type: PostgresContainerManager
const redis = registry.get('redis');       // Type: RedisContainerManager

// Cleanup
await registry.stopAll();
```

### 3. PostgreSQL Container

Full-featured PostgreSQL implementation:

```typescript
import { createPostgresContainer } from './testcontainers/postgres';

const postgres = createPostgresContainer({
  config: {
    database: 'test_db',
    username: 'test_user',
    password: 'test_pass',
    initScripts: ['./setup.sql'],
  },
});

await postgres.start();

// Create connection pool
const pool = postgres.createPool({ max: 10 });

// Execute queries
await pool.query('SELECT * FROM users');

// Run scripts
await postgres.executeScript('CREATE TABLE...');

// Health check
const healthy = await postgres.isHealthy();

// Cleanup
await pool.end();
await postgres.stop();
```

**Type-safe Connection:**
```typescript
interface PostgresConnection {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
}
```

### 4. Redis Container

Redis implementation with command execution:

```typescript
import { createRedisContainer } from './testcontainers/redis';

const redis = createRedisContainer({
  config: {
    password: 'secret',
    db: 0,
    maxMemory: '256mb',
    maxMemoryPolicy: 'allkeys-lru',
  },
});

await redis.start();

// Execute commands
await redis.executeCommand(['SET', 'key', 'value']);
const value = await redis.executeCommand(['GET', 'key']);

// Flush database
await redis.flushAll();

// Get info
const info = await redis.getInfo('memory');

// Connection string
const url = redis.getConnectionString(); // redis://:secret@localhost:6379/0
```

### 5. Generic Container

For any Docker image not specifically implemented:

```typescript
import { createGenericContainer } from './testcontainers/generic';
import { Wait } from 'testcontainers';

const custom = createGenericContainer({
  image: 'my-service:latest',
  ports: [8080, 8081],
  env: {
    API_KEY: 'secret',
    LOG_LEVEL: 'debug',
  },
  config: {
    command: ['./start.sh'],
    waitStrategy: Wait.forLogMessage('Server started'),
    volumes: [
      { source: '/host/path', target: '/container/path' },
    ],
    networkMode: 'bridge',
    healthCheckCommand: ['curl', 'http://localhost:8080/health'],
    healthCheckInterval: 5000,
  },
});

await custom.start();

// Get ports
const httpPort = custom.getPort(8080);
const metricsPort = custom.getPort(8081);

// Get URLs
const httpUrl = custom.getUrl(8080, 'http');

// Health check
await custom.waitUntilHealthy(30000);
```

### 6. Predefined Factories

Pre-configured containers for common services:

#### RabbitMQ

```typescript
import { createRabbitMQContainer } from './testcontainers/generic';

const rabbitmq = createRabbitMQContainer();
await rabbitmq.start();

const amqpPort = rabbitmq.getPort(5672);
const managementPort = rabbitmq.getPort(15672);
const amqpUrl = rabbitmq.getUrl(5672, 'amqp');
```

#### Elasticsearch

```typescript
import { createElasticsearchContainer } from './testcontainers/generic';

const elasticsearch = createElasticsearchContainer();
await elasticsearch.start();

const httpPort = elasticsearch.getPort(9200);
const esUrl = elasticsearch.getUrl(9200);
```

#### MinIO (S3-compatible)

```typescript
import { createMinIOContainer } from './testcontainers/generic';

const minio = createMinIOContainer();
await minio.start();

const s3Endpoint = minio.getUrl(9000);
const consoleUrl = minio.getUrl(9001);
```

#### Localstack (AWS Services)

```typescript
import { createLocalstackContainer } from './testcontainers/generic';

const localstack = createLocalstackContainer(['s3', 'sqs', 'dynamodb']);
await localstack.start();

const awsEndpoint = localstack.getUrl(4566);
```

## Usage Patterns

### Single Container Test

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { createPostgresContainer } from './testcontainers';

describe('integration: My Feature', () => {
  let postgres: PostgresContainerManager;
  let pool: Pool;

  beforeAll(async () => {
    postgres = createPostgresContainer();
    await postgres.start();
    pool = postgres.createPool();
  }, 60000);

  afterAll(async () => {
    await pool.end();
    await postgres.stop();
  });

  it('should work with database', async () => {
    const result = await pool.query('SELECT 1');
    expect(result.rows).toHaveLength(1);
  });
});
```

### Multi-Container Test

```typescript
import { createContainerRegistry } from './testcontainers';

type Containers = {
  postgres: PostgresContainerManager;
  redis: RedisContainerManager;
};

const registry = createContainerRegistry<Containers>();

beforeAll(async () => {
  registry.register('postgres', createPostgresContainer());
  registry.register('redis', createRedisContainer());
  await registry.startAll();
}, 90000);

afterAll(async () => {
  await registry.stopAll();
});

it('should coordinate between containers', async () => {
  const postgres = registry.get('postgres');
  const redis = registry.get('redis');

  // Create user in DB
  const pool = postgres.createPool();
  const result = await pool.query('INSERT INTO users...');

  // Cache in Redis
  await redis.executeCommand(['SET', `user:${result.rows[0].id}`, '...']);
});
```

### Helper Functions

```typescript
// tests/setup.ts
import { initializePostgresContainer, cleanupTestContainers } from './setup';

beforeAll(async () => {
  await initializePostgresContainer();
}, 60000);

afterAll(async () => {
  await cleanupTestContainers();
});
```

## Custom Container Example

Complete example of creating a custom MongoDB container:

```typescript
import { BaseContainerManager, type ContainerConfig } from './testcontainers/base';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';

interface MongoConnection {
  host: string;
  port: number;
  database: string;
  uri: string;
}

interface MongoConfig {
  database?: string;
  username?: string;
  password?: string;
  replicaSet?: string;
}

class MongoContainerManager extends BaseContainerManager<
  StartedTestContainer,
  MongoConnection,
  MongoConfig
> {
  protected async startContainer(): Promise<StartedTestContainer> {
    const { database = 'test', username, password } = this.config.config || {};

    let container = new GenericContainer(this.config.image)
      .withExposedPorts(...this.config.ports);

    if (username && password) {
      container = container.withEnvironment({
        MONGO_INITDB_ROOT_USERNAME: username,
        MONGO_INITDB_ROOT_PASSWORD: password,
        MONGO_INITDB_DATABASE: database,
      });
    }

    return await container.start();
  }

  protected createConnection(container: StartedTestContainer): MongoConnection {
    const { database = 'test', username, password } = this.config.config || {};
    const host = container.getHost();
    const port = container.getMappedPort(this.config.ports[0] ?? 27017);

    const auth = username && password ? `${username}:${password}@` : '';
    const uri = `mongodb://${auth}${host}:${port}/${database}`;

    return { host, port, database, uri };
  }

  getConnectionString(): string {
    return this.connection.uri;
  }

  async isHealthy(): Promise<boolean> {
    try {
      const result = await this.exec(['mongosh', '--eval', 'db.adminCommand({ping: 1})']);
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }
}

export function createMongoContainer(
  config?: Partial<ContainerConfig<MongoConfig>>
): MongoContainerManager {
  return new MongoContainerManager({
    image: 'mongo:7',
    ports: [27017],
    ...config,
  });
}
```

## Best Practices

### 1. Use Factory Functions

Always use factory functions instead of direct instantiation:

```typescript
// ✅ Good
const postgres = createPostgresContainer({ config: {...} });

// ❌ Avoid
const postgres = new PostgresContainerManager({ image: '...', ports: [...] });
```

### 2. Set Appropriate Timeouts

Container startup can take time:

```typescript
beforeAll(async () => {
  await postgres.start();
}, 60000); // 60 seconds for single container

beforeAll(async () => {
  await registry.startAll();
}, 90000); // 90 seconds for multiple containers
```

### 3. Always Cleanup

Use `afterAll` to ensure containers are stopped:

```typescript
afterAll(async () => {
  if (pool) await pool.end();
  await postgres.stop();
}, 30000);
```

### 4. Use Environment Variables

Skip integration tests when Docker isn't available:

```typescript
const shouldSkip = process.env.SKIP_INTEGRATION_TESTS === 'true';
const describeTest = shouldSkip ? describe.skip : describe;

describeTest('integration: ...', () => {
  // tests
});
```

### 5. Reuse Containers

For faster tests, consider reusing containers across test files:

```typescript
// Global setup
let globalPostgres: PostgresContainerManager | null = null;

export async function getPostgresContainer() {
  if (!globalPostgres) {
    globalPostgres = createPostgresContainer();
    await globalPostgres.start();
  }
  return globalPostgres;
}
```

## Performance Tips

1. **Start containers in parallel** - Use `registry.startAll()`
2. **Reuse containers** - Don't stop/start between tests
3. **Use smaller images** - Alpine variants start faster
4. **Increase resources** - Give Docker more CPU/memory
5. **Use test-specific configs** - Disable features not needed for tests

## Troubleshooting

### Container Won't Start

```bash
# Check Docker is running
docker ps

# Check available resources
docker info | grep -i memory

# View container logs
const logs = await container.getLogs();
console.log(logs);
```

### Port Conflicts

```bash
# Check what's using ports
lsof -i :5432

# Let testcontainers assign random ports (default)
const port = container.getMappedPort(5432); // Gets actual port
```

### Slow Tests

```bash
# Pull images beforehand
docker pull postgres:16-alpine
docker pull redis:7-alpine

# Use lighter images
createPostgresContainer({ image: 'postgres:16-alpine' })
```

## Examples

See comprehensive examples in:
- `tests/integration/repository.test.ts` - PostgreSQL integration tests
- `tests/examples/multi-container.example.ts` - Multi-container examples
- `tests/setup.ts` - Helper functions

## API Reference

### BaseContainerManager

```typescript
abstract class BaseContainerManager<TContainer, TConnection, TConfig> {
  // Lifecycle
  async start(): Promise<IContainerInstance>
  async stop(): Promise<void>

  // Execution
  async exec(command: string[]): Promise<{ output: string; exitCode: number }>
  async getLogs(): Promise<string>

  // Health
  async isHealthy(): Promise<boolean>

  // Connection
  abstract getConnectionString(): string
  get container(): TContainer
  get connection(): TConnection

  // Abstract methods to implement
  protected abstract startContainer(): Promise<TContainer>
  protected abstract createConnection(container: TContainer): TConnection
}
```

### ContainerRegistry

```typescript
class ContainerRegistry<TContainers extends Record<string, IContainerInstance>> {
  register<K extends keyof TContainers>(name: K, container: TContainers[K]): this
  get<K extends keyof TContainers>(name: K): TContainers[K]
  has(name: keyof TContainers): boolean
  async startAll(): Promise<void>
  async stopAll(): Promise<void>
  getNames(): Array<keyof TContainers>
  get size(): number
}
```

## Summary

The generic testcontainer system provides:

✅ **Full Type Safety** - Three levels of generics for complete type inference
✅ **Any Container** - Support for any Docker image
✅ **Predefined Services** - PostgreSQL, Redis, RabbitMQ, Elasticsearch, MinIO, Localstack
✅ **Multi-Container** - Type-safe registry for orchestrating multiple containers
✅ **Extensible** - Easy to create custom container managers
✅ **Production-Ready** - Proper cleanup, health checks, error handling

This makes integration testing with real services simple, type-safe, and maintainable.
