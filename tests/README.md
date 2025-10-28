# Testing Guide

## Overview

This template includes comprehensive tests demonstrating the generic type system and core functionality.

## Test Structure

```
tests/
├── setup.ts              # Test utilities and helpers
├── unit/                 # Unit tests (no external dependencies)
│   ├── config.test.ts   # Configuration validation tests
│   ├── retry-strategy.test.ts # Retry strategy tests
│   └── types.test.ts     # Generic type system tests
└── integration/          # Integration tests (with database)
    └── repository.test.ts # Repository pattern tests
```

## Running Tests

### All Tests

```bash
bun test
```

### Unit Tests Only

```bash
bun test:unit
```

### Integration Tests

```bash
# Start PostgreSQL first
docker-compose up -d postgres

# Run integration tests
bun test:integration
```

### With Coverage

```bash
bun test:coverage
```

### Watch Mode

```bash
bun test:watch
```

## Test Categories

### Unit Tests

**No external dependencies** - test pure logic and type validation:

- ✅ Configuration schema validation with Zod
- ✅ Retry strategy calculations (exponential, linear, constant)
- ✅ Generic type utilities and type inference
- ✅ Type safety demonstrations

### Integration Tests

**Require PostgreSQL** - test database operations:

- ✅ Repository CRUD operations
- ✅ Transaction handling
- ✅ Pagination
- ✅ Query builders
- ✅ Soft delete functionality

**Note:** Integration tests use Testcontainers to spin up a real PostgreSQL instance. This requires Docker to be running.

## Generic Testcontainer System

This template includes a comprehensive **generic testcontainer system** that allows you to provision any type of Docker container for testing.

### Architecture

The testcontainer system uses TypeScript generics for full type safety:

- **BaseContainerManager<TContainer, TConnection, TConfig>** - Abstract base class
- **ContainerRegistry<TContainers>** - Type-safe registry for multiple containers
- **Specific Implementations** - PostgreSQL, Redis, and more
- **GenericContainerManager** - For any Docker image

### Using PostgreSQL Testcontainer

```typescript
import { createPostgresContainer } from './testcontainers/postgres';
import { beforeAll, afterAll } from 'bun:test';

let postgres: PostgresContainerManager;
let pool: Pool;

beforeAll(async () => {
  postgres = createPostgresContainer({
    config: {
      database: 'test_db',
      username: 'test_user',
      password: 'test_pass',
    },
  });

  await postgres.start();
  pool = postgres.createPool();

  // Run migrations or setup
  await pool.query('CREATE TABLE...');
}, 60000);

afterAll(async () => {
  await pool.end();
  await postgres.stop();
});
```

### Using Redis Testcontainer

```typescript
import { createRedisContainer } from './testcontainers/redis';

const redis = createRedisContainer({
  config: {
    password: 'secret',
    maxMemory: '128mb',
  },
});

await redis.start();

// Execute commands
const result = await redis.executeCommand(['SET', 'key', 'value']);
await redis.flushAll();

// Get connection details
const url = redis.getConnectionString(); // redis://:secret@localhost:6379/0
```

### Using Generic Containers

For any Docker image not specifically implemented:

```typescript
import { createGenericContainer } from './testcontainers/generic';
import { Wait } from 'testcontainers';

const rabbitmq = createGenericContainer({
  image: 'rabbitmq:3-management',
  ports: [5672, 15672],
  env: {
    RABBITMQ_DEFAULT_USER: 'guest',
    RABBITMQ_DEFAULT_PASS: 'guest',
  },
  config: {
    waitStrategy: Wait.forLogMessage('started TCP listener'),
  },
});

await rabbitmq.start();
const amqpPort = rabbitmq.getPort(5672);
const amqpUrl = rabbitmq.getUrl(5672, 'amqp');
```

### Predefined Container Factories

The template includes factories for common services:

```typescript
import {
  createRabbitMQContainer,
  createElasticsearchContainer,
  createMinIOContainer,
  createLocalstackContainer,
} from './testcontainers/generic';

// RabbitMQ message broker
const rabbitmq = createRabbitMQContainer();
await rabbitmq.start();

// Elasticsearch search engine
const elasticsearch = createElasticsearchContainer();
await elasticsearch.start();

// MinIO (S3-compatible storage)
const minio = createMinIOContainer();
await minio.start();
const s3Url = minio.getUrl(9000);

// Localstack (AWS services emulation)
const localstack = createLocalstackContainer(['s3', 'sqs', 'dynamodb']);
await localstack.start();
const awsEndpoint = localstack.getUrl(4566);
```

### Managing Multiple Containers

Use `ContainerRegistry` for orchestrating multiple containers:

```typescript
import { createContainerRegistry } from './testcontainers/base';
import { createPostgresContainer } from './testcontainers/postgres';
import { createRedisContainer } from './testcontainers/redis';

// Define container types
type TestContainers = {
  postgres: PostgresContainerManager;
  redis: RedisContainerManager;
};

const registry = createContainerRegistry<TestContainers>();

// Register containers
registry.register('postgres', createPostgresContainer());
registry.register('redis', createRedisContainer());

// Start all containers in parallel
await registry.startAll();

// Access specific containers
const postgres = registry.get('postgres');
const redis = registry.get('redis');

// Cleanup all containers
await registry.stopAll();
```

### Creating Custom Container Managers

Extend `BaseContainerManager` for custom implementations:

```typescript
import { BaseContainerManager, type ContainerConfig } from './testcontainers/base';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';

interface MongoConnection {
  host: string;
  port: number;
  database: string;
}

interface MongoConfig {
  database?: string;
  username?: string;
  password?: string;
}

class MongoContainerManager extends BaseContainerManager<
  StartedTestContainer,
  MongoConnection,
  MongoConfig
> {
  protected async startContainer(): Promise<StartedTestContainer> {
    const { database = 'test', username, password } = this.config.config || {};

    let container = new GenericContainer(this.config.image)
      .withExposedPorts(...this.config.ports)
      .withEnvironment({
        MONGO_INITDB_DATABASE: database,
        ...(username && { MONGO_INITDB_ROOT_USERNAME: username }),
        ...(password && { MONGO_INITDB_ROOT_PASSWORD: password }),
      });

    return await container.start();
  }

  protected createConnection(container: StartedTestContainer): MongoConnection {
    const { database = 'test' } = this.config.config || {};

    return {
      host: container.getHost(),
      port: container.getMappedPort(this.config.ports[0] ?? 27017),
      database,
    };
  }

  getConnectionString(): string {
    const { username, password } = this.config.config || {};
    const conn = this.connection;
    const auth = username && password ? `${username}:${password}@` : '';
    return `mongodb://${auth}${conn.host}:${conn.port}/${conn.database}`;
  }
}

// Factory function
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

### Integration Tests with Testcontainers

Full integration testing with isolated containers:

```bash
# Ensure Docker is running
docker ps

# Run integration tests
bun test tests/integration/

# Skip integration tests
SKIP_INTEGRATION_TESTS=true bun test
```

The tests will:
1. Start required containers (PostgreSQL, Redis, etc.)
2. Run all database/integration tests
3. Clean up containers automatically

## Writing Tests

### Unit Test Example

```typescript
import { describe, it, expect } from 'bun:test';

describe('unit: MyFeature', () => {
  it('should do something', () => {
    const result = myFunction(input);
    expect(result).toBe(expected);
  });
});
```

### Integration Test Example

```typescript
import { describe, it, expect, beforeAll } from 'bun:test';
import { testPool } from '../setup';

describe('integration: DatabaseFeature', () => {
  beforeAll(async () => {
    // Setup test database
    await testPool.query('CREATE TABLE...');
  });

  it('should interact with database', async () => {
    const result = await testPool.query('SELECT...');
    expect(result.rows).toBeDefined();
  });
});
```

## Test Coverage

Run tests with coverage to see which parts of the codebase are tested:

```bash
bun test --coverage
```

Coverage reports are generated in `./coverage/`

## Continuous Integration

Tests run automatically in CI/CD pipelines (see `.github/workflows/ci.yml`).

## Debugging Tests

### VSCode

Add to `.vscode/launch.json`:

```json
{
  "type": "bun",
  "request": "launch",
  "name": "Debug Tests",
  "program": "${workspaceFolder}/tests/**/*.test.ts",
  "cwd": "${workspaceFolder}",
  "stopOnEntry": false
}
```

### Command Line

```bash
# Run specific test file
bun test tests/unit/config.test.ts

# Run tests matching pattern
bun test --test-name-pattern="should validate"
```

## Best Practices

1. **Test Naming** - Use descriptive test names: `should <expected behavior> when <condition>`
2. **AAA Pattern** - Arrange, Act, Assert in each test
3. **Isolation** - Each test should be independent
4. **Fast Tests** - Keep unit tests fast, integration tests can be slower
5. **Coverage** - Aim for >80% code coverage on core logic

## Mocking

For testing jobs without Graphile Worker:

```typescript
import { createTestLogger } from '../setup';

const mockContext = {
  logger: createTestLogger(),
  correlationId: 'test-id' as CorrelationId,
  span: {} as Span,
  attemptNumber: 1,
  maxAttempts: 3,
  // ... other context properties
};
```

## Performance Testing

For testing job performance:

```typescript
it('should process job within time limit', async () => {
  const start = Date.now();
  await job.execute(payload, context);
  const duration = Date.now() - start;

  expect(duration).toBeLessThan(1000); // 1 second
});
```

## Troubleshooting

### Tests Hanging

- Check if Docker is running (for testcontainers)
- Ensure database containers are cleaned up: `docker ps`
- Check for open database connections

### Type Errors

- Run `bun run typecheck` to see TypeScript errors
- Ensure all test files use correct imports

### Slow Tests

- Unit tests should be < 100ms
- Integration tests < 1s per test
- Use `beforeAll` for expensive setup instead of `beforeEach`

## Resources

- [Bun Test Runner](https://bun.sh/docs/cli/test)
- [Testcontainers](https://testcontainers.com/)
- [Zod Documentation](https://zod.dev/)
