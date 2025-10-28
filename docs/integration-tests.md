# Integration Test Setup Guide

This guide explains how to set up and run integration tests for the Graphile Worker template.

## Overview

The template includes both unit tests and integration tests:

- **Unit Tests**: Run in isolation without external dependencies (49 tests currently passing)
- **Integration Tests**: Require real database connections and Docker for testcontainers (13 tests currently skipped by default)

## Prerequisites

### Required

- [Docker](https://www.docker.com/) - For running testcontainers
- [Docker Compose](https://docs.docker.com/compose/) - For orchestrating services
- [Bun](https://bun.sh) >= 1.0.0 - JavaScript runtime
- PostgreSQL client libraries (installed automatically with dependencies)

### Optional

- [Docker Desktop](https://www.docker.com/products/docker-desktop) - GUI for managing containers
- [TablePlus](https://tableplus.com/) or [pgAdmin](https://www.pgadmin.org/) - Database GUI tools

## Quick Start

### 1. Verify Docker is Running

```bash
# Check Docker daemon status
docker ps

# If not running, start Docker Desktop or run:
sudo systemctl start docker  # Linux
```

### 2. Run All Tests (Including Integration)

```bash
# Install dependencies if not already done
bun install

# Run all tests (unit + integration)
bun test

# Integration tests will automatically:
# - Pull required Docker images
# - Start testcontainers
# - Run migrations
# - Execute tests
# - Clean up containers
```

### 3. Run Only Unit Tests

```bash
# Skip integration tests entirely
SKIP_INTEGRATION_TESTS=true bun test

# Or run specific test files
bun test tests/unit/
```

### 4. Run Only Integration Tests

```bash
bun test tests/integration/
```

## Integration Test Architecture

### Testcontainer System

The template uses a **generic testcontainer framework** for spinning up real services during tests:

```typescript
// File: tests/testcontainers/base.ts
export abstract class BaseContainerManager<TContainer, TConnection, TConfig> {
  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
  abstract createConnection(): Promise<TConnection>;
  abstract healthCheck(): Promise<boolean>;
}
```

### Available Testcontainers

#### PostgreSQL Container

```typescript
import { createPostgresContainer } from './testcontainers/postgres';

const postgres = createPostgresContainer({
  config: {
    database: 'test_db',
    user: 'test_user',
    password: 'test_pass',
  },
});

await postgres.start();
const pool = postgres.createPool(); // Returns pg.Pool
const client = await pool.connect();

// Run migrations
await postgres.runMigrations('./migrations');

// Cleanup
await postgres.stop();
```

#### Redis Container

```typescript
import { createRedisContainer } from './testcontainers/redis';

const redis = createRedisContainer({
  config: { password: 'redis_pass' },
});

await redis.start();
await redis.executeCommand(['SET', 'key', 'value']);
const value = await redis.executeCommand(['GET', 'key']);

await redis.stop();
```

#### Generic Container (Any Docker Image)

```typescript
import { createGenericContainer } from './testcontainers/base';

const rabbitmq = createGenericContainer({
  image: 'rabbitmq:3-management',
  exposedPorts: [5672, 15672],
  env: {
    RABBITMQ_DEFAULT_USER: 'guest',
    RABBITMQ_DEFAULT_PASS: 'guest',
  },
  waitStrategy: {
    type: 'port',
    port: 5672,
  },
});

await rabbitmq.start();
const host = rabbitmq.getHost();
const port = rabbitmq.getMappedPort(5672);

await rabbitmq.stop();
```

### Container Registry (Multi-Container Tests)

```typescript
import { ContainerRegistry } from './testcontainers/registry';

const registry = new ContainerRegistry({
  postgres: createPostgresContainer(),
  redis: createRedisContainer(),
});

// Start all containers in parallel
await registry.startAll();

// Get individual containers
const pg = registry.get('postgres');
const redis = registry.get('redis');

// Stop all containers
await registry.stopAll();
```

## Current Integration Tests

### Repository Tests (`tests/integration/repository.test.ts`)

These tests verify the `BaseRepository` pattern with a real PostgreSQL database:

**Why Skipped by Default:**
- Requires Docker to be running
- Downloads PostgreSQL image (~300MB) on first run
- Slower than unit tests (container startup overhead)

**What They Test:**
- ✅ CRUD operations (create, find, update, delete)
- ✅ Query filtering with typed conditions
- ✅ Pagination and counting
- ✅ Transaction management
- ✅ Rollback on errors
- ✅ Existence checks

**To Enable:**
```bash
# Ensure Docker is running
docker ps

# Run repository integration tests
bun test tests/integration/repository.test.ts
```

**Expected Output:**
```
tests/integration/repository.test.ts:
(pass) integration: BaseRepository > should create a new user
(pass) integration: BaseRepository > should find user by ID
(pass) integration: BaseRepository > should return null for non-existent user
(pass) integration: BaseRepository > should update user
(pass) integration: BaseRepository > should find one user by criteria
(pass) integration: BaseRepository > should find many users by criteria
(pass) integration: BaseRepository > should count users
(pass) integration: BaseRepository > should count users by criteria
(pass) integration: BaseRepository > should check if user exists
(pass) integration: BaseRepository > should return false for non-existent user
(pass) integration: BaseRepository > should execute transaction
(pass) integration: BaseRepository > should rollback transaction on error
(pass) integration: BaseRepository > should handle pagination

13 pass
0 skip
```

## Troubleshooting

### Issue: "Cannot connect to Docker daemon"

**Solution:**
```bash
# Start Docker
sudo systemctl start docker  # Linux
open -a Docker              # macOS

# Verify Docker is running
docker ps
```

### Issue: "Port already in use"

**Cause:** A previous test run didn't clean up containers properly.

**Solution:**
```bash
# List all containers
docker ps -a

# Stop and remove test containers
docker stop $(docker ps -a -q --filter "name=test")
docker rm $(docker ps -a -q --filter "name=test")

# Or clean up all stopped containers
docker container prune -f
```

### Issue: "Image pull timeout"

**Cause:** Slow network or Docker Hub rate limiting.

**Solution:**
```bash
# Pre-pull images before running tests
docker pull postgres:16-alpine
docker pull redis:7-alpine

# Or use Docker Desktop to pull images via GUI
```

### Issue: "Tests timeout waiting for container"

**Cause:** Container health check is failing.

**Solution:**
```bash
# Check container logs
docker logs <container-id>

# Increase timeout in test setup
const postgres = createPostgresContainer({
  startupTimeout: 60000, // 60 seconds instead of default 30
});
```

### Issue: "Permission denied" errors

**Cause:** Docker socket permissions on Linux.

**Solution:**
```bash
# Add user to docker group
sudo usermod -aG docker $USER

# Log out and back in, or run:
newgrp docker

# Verify
docker ps
```

## CI/CD Integration

### GitHub Actions

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      docker:
        image: docker:latest
        options: --privileged

    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v1
        with:
          bun-version: latest

      - run: bun install

      - name: Run unit tests
        run: bun test tests/unit/

      - name: Run integration tests
        run: bun test tests/integration/
```

### GitLab CI

```yaml
test:
  image: oven/bun:latest
  services:
    - docker:dind
  variables:
    DOCKER_HOST: tcp://docker:2375
    DOCKER_TLS_CERTDIR: ""
  script:
    - bun install
    - bun test
```

### Local CI Simulation

```bash
# Run tests exactly as CI would
docker run --rm \
  -v $(pwd):/app \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -w /app \
  oven/bun:latest \
  bun test
```

## Writing New Integration Tests

### Template

```typescript
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { createPostgresContainer } from '../testcontainers/postgres';
import type { Pool } from 'pg';

describe('integration: My Feature', () => {
  let postgres: ReturnType<typeof createPostgresContainer>;
  let pool: Pool;

  beforeAll(async () => {
    // Setup
    postgres = createPostgresContainer();
    await postgres.start();
    pool = postgres.createPool();

    // Run migrations if needed
    await postgres.runMigrations('./migrations');
  });

  afterAll(async () => {
    // Cleanup
    await pool.end();
    await postgres.stop();
  });

  test('should do something with real database', async () => {
    const client = await pool.connect();
    try {
      const result = await client.query('SELECT NOW()');
      expect(result.rows).toHaveLength(1);
    } finally {
      client.release();
    }
  });
});
```

### Best Practices

1. **Isolation**: Each test file should manage its own containers
2. **Cleanup**: Always stop containers in `afterAll` hooks
3. **Parallel Safety**: Use unique database names or schemas per test file
4. **Timeouts**: Set appropriate timeouts for slow operations
5. **Idempotency**: Tests should be runnable multiple times
6. **Fixtures**: Use consistent test data for reproducibility

## Performance Tips

### Cache Docker Images Locally

```bash
# Pull images once
docker pull postgres:16-alpine
docker pull redis:7-alpine

# Images are cached locally
docker images
```

### Use In-Memory Postgres

For faster tests, configure PostgreSQL to use tmpfs:

```typescript
const postgres = createPostgresContainer({
  config: {
    // Store data in memory
    mountTmpfs: { '/var/lib/postgresql/data': 'rw,noexec,nosuid,size=512m' },
  },
});
```

### Reuse Containers Across Tests

```typescript
// Global container setup (use with caution)
let globalPostgres: ReturnType<typeof createPostgresContainer>;

beforeAll(async () => {
  if (!globalPostgres) {
    globalPostgres = createPostgresContainer();
    await globalPostgres.start();
  }
});

// Clean data between tests, not containers
afterEach(async () => {
  const pool = globalPostgres.createPool();
  await pool.query('TRUNCATE TABLE users CASCADE');
});
```

### Parallel Test Execution

```bash
# Bun supports parallel tests by default
bun test --concurrent

# Limit concurrency if Docker struggles
bun test --concurrent 2
```

## Resources

- [Testcontainers Documentation](https://testcontainers.com/)
- [Bun Test Runner](https://bun.sh/docs/cli/test)
- [PostgreSQL Testcontainer](https://github.com/testcontainers/testcontainers-node/tree/main/packages/postgresql)
- [Docker Documentation](https://docs.docker.com/)
- [Graphile Worker Testing](https://worker.graphile.org/docs/testing)

## Support

If you encounter issues with integration tests:

1. Check Docker is running: `docker ps`
2. Review container logs: `docker logs <container-id>`
3. Verify network connectivity: `docker network ls`
4. Check disk space: `docker system df`
5. Clean up resources: `docker system prune -f`

For template-specific issues, please [open an issue](https://github.com/Oppulence-Engineering/worker-template/issues) on GitHub.
