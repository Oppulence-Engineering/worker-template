# Graphile Worker Template

> **Production-ready TypeScript Graphile Worker microservice template with extensive generics, OpenTelemetry instrumentation, and enterprise-grade patterns**

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.1-orange)](https://bun.sh)

## 🚀 Features

### Core Capabilities
- ⚡ **Bun Runtime** - Ultra-fast JavaScript runtime with native TypeScript support
- 🎯 **Extensive Generics** - Type-safe job system with full generic type inference
- 🔄 **Job Inheritance** - Reusable job patterns (BaseJob, RetryableJob, BatchJob)
- ✅ **Zod Validation** - Runtime type validation for all configurations and payloads
- 📊 **OpenTelemetry** - Complete observability with metrics, traces, and logs
- 🐳 **Docker Ready** - Multi-stage builds with production optimizations
- ☸️ **Kubernetes Ready** - Helm charts included (Helm charts to be added in final delivery)
- 📦 **Monorepo Friendly** - Designed to integrate seamlessly into existing monorepos

### Advanced Features
- **Retry Strategies**: Exponential, linear, and custom backoff strategies
- **Batch Processing**: Efficient batch job processing with concurrency control
- **Graceful Shutdown**: Proper signal handling and job completion
- **Health Checks**: Kubernetes-ready liveness and readiness probes
- **Dependency Injection**: Service layer with full DI support
- **Generic Repository Pattern**: Type-safe database operations
- **Middleware Pipeline**: Composable middleware with full type safety
- **Event Bus**: Type-safe event system for job lifecycle hooks

## 📋 Table of Contents

- [Quick Start](#-quick-start)
- [Architecture](#-architecture)
- [Job Development](#-job-development)
- [Configuration](#-configuration)
- [Observability](#-observability)
- [Docker Deployment](#-docker-deployment)
- [Monorepo Integration](#-monorepo-integration)
- [API Reference](#-api-reference)

## 🏃 Quick Start

### Prerequisites

- [Bun](https://bun.sh) >= 1.0.0
- [PostgreSQL](https://www.postgresql.org/) >= 14
- [Docker](https://www.docker.com/) (optional, for containerized development)

### Installation

```bash
# Install dependencies
bun install

# Copy environment file
cp .env.example .env

# Edit .env with your configuration
nano .env
```

### Local Development

```bash
# Start with Docker Compose (includes Postgres, Jaeger, Prometheus, Grafana)
docker-compose up -d

# Run database migrations
bun run migrate

# Start the worker in development mode
bun run dev:worker

# In another terminal, you can enqueue test jobs
bun run scripts/enqueue-test-jobs.ts
```

### Access Services

- **Jaeger UI** (Tracing): http://localhost:16686
- **Prometheus** (Metrics): http://localhost:9091
- **Grafana** (Dashboards): http://localhost:3000 (admin/admin)
- **Worker Metrics**: http://localhost:9090/metrics
- **Worker Health**: http://localhost:8080/health

## 🏗 Architecture

### Project Structure

```
graphile-worker-template/
├── src/
│   ├── core/
│   │   ├── abstractions/        # Base classes (BaseJob, BaseRepository, etc.)
│   │   ├── config/              # Configuration with Zod validation
│   │   ├── instrumentation/     # OpenTelemetry setup (metrics, tracing, logs)
│   │   ├── types/               # TypeScript utility types (150+ generic types)
│   │   └── worker/              # Job registry and worker setup
│   ├── jobs/
│   │   ├── base/                # Specialized job classes
│   │   │   ├── RetryableJob.ts  # Jobs with retry logic
│   │   │   └── BatchJob.ts      # Batch processing jobs
│   │   └── examples/            # Example job implementations
│   │       └── EmailJob.ts      # Example email job
│   └── worker.ts                # Main worker entry point
├── migrations/                  # Database migrations (Graphile Migrate)
├── docker/
│   ├── Dockerfile               # Multi-stage production Dockerfile
│   └── prometheus/              # Prometheus configuration
├── docker-compose.yml           # Local development stack
└── package.json
```

### Type System

This template showcases **extensive use of TypeScript generics** for maximum type safety:

```typescript
// Example: Fully typed job with generic payload and result
class EmailJob extends ExponentialRetryJob<typeof EmailSchema, void> {
  // Full type inference throughout
}

// Type-safe job registration
registry.register(new EmailJob());

// Inferred types
type Payload = InferJobPayload<EmailJob>; // Zod schema inference
type Result = InferJobResult<EmailJob>;   // Return type inference
```

## 💼 Job Development

### Creating a Simple Job

```typescript
import { z } from 'zod';
import { BaseJob } from './core/abstractions/BaseJob';
import type { JobConfig, JobContext, JobName } from './core/types';

// 1. Define payload schema with Zod
const MyJobSchema = z.object({
  data: z.string(),
  userId: z.string().uuid(),
});

// 2. Extend BaseJob with generic types
class MyJob extends BaseJob<typeof MyJobSchema, void> {
  protected readonly jobName = 'my-job' as JobName;
  protected readonly schema = MyJobSchema;
  protected readonly defaultConfig: Partial<JobConfig> = {
    maxAttempts: 3,
    priority: 0,
  };

  // 3. Implement execute method
  async execute(payload: z.infer<typeof MyJobSchema>, context: JobContext): Promise<void> {
    context.logger.info({ payload }, 'Processing job');

    // Your business logic here
    await this.processData(payload.data);

    context.logger.info('Job completed');
  }

  private async processData(data: string): Promise<void> {
    // Implementation
  }
}
```

### Creating a Retryable Job

```typescript
import { ExponentialRetryJob } from './jobs/base/RetryableJob';

class ResilientJob extends ExponentialRetryJob<typeof MySchema, void> {
  protected readonly jobName = 'resilient-job' as JobName;
  protected readonly schema = MySchema;
  protected readonly defaultConfig = { maxAttempts: 5 };

  // Override retry configuration
  protected override readonly strategyConfig = {
    baseDelay: 2000,    // Start with 2s
    maxDelay: 300000,   // Max 5 minutes
    factor: 3,          // 3x backoff
    jitter: true,       // Add randomness
  };

  async execute(payload: z.infer<typeof MySchema>, context: JobContext): Promise<void> {
    // This will automatically retry with exponential backoff on failure
    await this.callExternalAPI(payload);
  }
}
```

### Creating a Batch Job

```typescript
import { BatchJob } from './jobs/base/BatchJob';

const BatchSchema = z.object({
  items: z.array(z.object({
    id: z.string(),
    value: z.number(),
  })),
});

class ProcessBatchJob extends BatchJob<
  typeof BatchSchema,
  z.infer<typeof BatchSchema>['items'][0],
  void
> {
  protected readonly jobName = 'process-batch' as JobName;
  protected readonly schema = BatchSchema;
  protected readonly defaultConfig = { maxAttempts: 3 };
  protected readonly batchSize = 50;
  protected readonly maxConcurrency = 10;
  protected readonly errorStrategy = 'continue'; // Don't stop on individual failures

  protected extractItems(payload: z.infer<typeof BatchSchema>) {
    return payload.items;
  }

  protected async processItem(item: any, context: JobContext): Promise<void> {
    // Process each item individually
    await this.processOne(item);
  }
}
```

### Registering Jobs

```typescript
// In src/worker.ts
import { JobRegistry } from './core/worker/JobRegistry';
import { EmailJob } from './jobs/examples/EmailJob';
import { MyJob } from './jobs/MyJob';

const registry = new JobRegistry();
registry.register(new EmailJob());
registry.register(new MyJob());
registry.register(new ProcessBatchJob());
```

## ⚙️ Configuration

Configuration is managed through environment variables with **full Zod validation**:

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=graphile_worker
DB_USER=postgres
DB_PASSWORD=postgres
DB_MAX_CONNECTIONS=10

# Worker
WORKER_CONCURRENCY=5
WORKER_POLL_INTERVAL=1000

# Observability
SERVICE_NAME=graphile-worker-template
SERVICE_VERSION=1.0.0
ENVIRONMENT=development
LOG_LEVEL=info
LOG_PRETTY=true
METRICS_ENABLED=true
TRACING_ENABLED=true
OTLP_ENDPOINT=http://localhost:4317
```

See [.env.example](.env.example) for all available options.

## 📊 Observability

### Metrics

The template includes comprehensive metrics collection:

- **Job Metrics**: `jobs_processed_total`, `job_duration_seconds`, `job_errors_total`
- **Database Metrics**: `db_query_duration_seconds`, `db_connection_pool_size`
- **System Metrics**: CPU, memory, and runtime metrics

Access metrics at `http://localhost:9090/metrics`

### Distributed Tracing

Every job execution is automatically traced with OpenTelemetry:

- Job lifecycle spans
- Database query spans
- Custom spans in your code

View traces in Jaeger UI: `http://localhost:16686`

### Structured Logging

All logs are structured JSON with correlation IDs:

```json
{
  "level": "info",
  "time": "2025-10-28T12:00:00.000Z",
  "service": "graphile-worker-template",
  "correlationId": "uuid-here",
  "jobName": "send-email",
  "msg": "Job started"
}
```

## 🐳 Docker Deployment

### Build

```bash
docker build -t graphile-worker:latest .
```

### Run

```bash
docker run -d \
  --name graphile-worker \
  -e DB_HOST=postgres \
  -e DB_PORT=5432 \
  -e DB_NAME=graphile_worker \
  -e DB_USER=postgres \
  -e DB_PASSWORD=postgres \
  -p 8080:8080 \
  -p 9090:9090 \
  graphile-worker:latest
```

### Docker Compose

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f worker

# Stop services
docker-compose down
```

## 🔧 Monorepo Integration

This template is designed to integrate seamlessly into monorepos:

### With pnpm Workspaces

```json
{
  "name": "my-monorepo",
  "workspaces": [
    "packages/*",
    "services/graphile-worker"
  ]
}
```

### With Turborepo

```json
{
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false
    }
  }
}
```

### Shared Packages

Create shared types and utilities:

```typescript
// packages/shared-types/src/jobs.ts
export const UserEventSchema = z.object({
  userId: z.string(),
  eventType: z.string(),
});

// services/graphile-worker/src/jobs/UserEventJob.ts
import { UserEventSchema } from '@my-org/shared-types';

class UserEventJob extends BaseJob<typeof UserEventSchema, void> {
  // Implementation
}
```

## 📚 API Reference

### BaseJob<TPayload, TResult, TMetadata>

Base abstract class for all jobs.

**Type Parameters:**
- `TPayload`: Zod schema type for payload validation
- `TResult`: Job execution result type
- `TMetadata`: Additional context metadata type

**Key Methods:**
- `execute(payload, context): Promise<TResult>` - Main execution logic
- `validate(payload): TPayload` - Validate payload against schema
- `beforeExecute(payload, context)` - Pre-execution hook
- `afterExecute(result, context)` - Post-execution hook
- `onError(error, context)` - Error handling hook

### RetryableJob<TPayload, TResult, TStrategy, TMetadata>

Extends BaseJob with configurable retry strategies.

**Additional Properties:**
- `retryStrategy`: Retry strategy instance
- `strategyConfig`: Strategy configuration
- `isRetryableError(error): boolean` - Determine if error is retryable

### BatchJob<TPayload, TItem, TResult, TMetadata>

Process arrays of items efficiently.

**Key Properties:**
- `batchSize`: Number of items per batch
- `maxConcurrency`: Maximum concurrent item processing
- `errorStrategy`: How to handle item failures

**Key Methods:**
- `extractItems(payload): TItem[]` - Extract items from payload
- `processItem(item, context): Promise<TResult>` - Process single item

### JobRegistry

Type-safe job registration and management.

**Methods:**
- `register<T extends IJob>(job: T): this` - Register a job
- `getTaskList(): TaskList` - Get Graphile Worker task list
- `getJob(name: JobName): IJob | undefined` - Get registered job
- `getStats()` - Get registry statistics

## 🤝 Contributing

Contributions are welcome! This is an open-source template designed for community use.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the Apache 2.0 License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Graphile Worker](https://worker.graphile.org/) - Robust job queue for PostgreSQL
- [Bun](https://bun.sh) - Fast JavaScript runtime
- [OpenTelemetry](https://opentelemetry.io/) - Observability framework
- [Zod](https://zod.dev/) - TypeScript-first schema validation

## 📖 Further Reading

- [Graphile Worker Documentation](https://worker.graphile.org/docs)
- [OpenTelemetry JavaScript](https://opentelemetry.io/docs/instrumentation/js/)
- [PostGraphile Documentation](https://www.graphile.org/postgraphile/) (for API integration)
- [PostgREST Documentation](https://postgrest.org/) (alternative REST API)

---

**Built with ❤️ by Oppulence Engineering**

## 🧪 Testing

The template includes comprehensive tests demonstrating type safety and functionality.

### Run Tests

```bash
# Run all tests
bun test

# Run with coverage
bun test --coverage

# Watch mode
bun test --watch
```

### Test Results

✅ **36 unit tests passing** covering:
- Configuration validation with Zod
- Retry strategies (exponential, linear, constant backoff)
- Generic type system (150+ type utilities)
- Type inference and type safety

See [TEST_SUMMARY.md](TEST_SUMMARY.md) for detailed test coverage.

### Integration Tests

Integration tests use a **generic testcontainer system** that can provision any Docker container:

```bash
# Requires Docker running
docker ps

# Run integration tests (containers start automatically)
bun test tests/integration/

# Skip integration tests
SKIP_INTEGRATION_TESTS=true bun test
```

**Generic Testcontainer Features:**
- 🔧 **Type-safe** - Full generic type system with `BaseContainerManager<TContainer, TConnection, TConfig>`
- 🐳 **Any Container** - PostgreSQL, Redis, RabbitMQ, Elasticsearch, MongoDB, or any Docker image
- 📦 **Container Registry** - Manage multiple containers with `ContainerRegistry<TContainers>`
- 🏭 **Factory Functions** - Pre-built factories for common services
- 🧹 **Auto Cleanup** - Automatic container lifecycle management

**Example Usage:**

```typescript
import { createPostgresContainer, createRedisContainer } from './testcontainers';

// PostgreSQL with type-safe connection
const postgres = createPostgresContainer({
  config: { database: 'test_db' }
});
await postgres.start();
const pool = postgres.createPool();

// Redis with commands
const redis = createRedisContainer();
await redis.start();
await redis.executeCommand(['SET', 'key', 'value']);

// Any Docker image
const rabbitmq = createGenericContainer({
  image: 'rabbitmq:3-management',
  ports: [5672, 15672],
  env: { RABBITMQ_DEFAULT_USER: 'guest' }
});
```

Tests include:
- Repository CRUD operations with PostgreSQL testcontainer
- Transaction handling and rollback verification
- Pagination and filtering with real database
- Type-safe database operations
- Multi-container orchestration with ContainerRegistry

See [tests/readme.md](tests/readme.md) for complete testcontainer documentation.

