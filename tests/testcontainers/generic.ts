/**
 * @fileoverview Generic testcontainer for custom services
 * @module tests/testcontainers/generic
 */

import { GenericContainer, type StartedTestContainer, type Wait } from 'testcontainers';

import { BaseContainerManager, type ContainerConfig } from './base';

/**
 * Generic connection details
 */
export interface GenericConnection {
  host: string;
  ports: Record<string, number>;
  env: Record<string, string>;
}

/**
 * Generic container configuration
 */
export interface GenericConfig {
  /** Container command to run */
  command?: string[];
  /** Wait strategy */
  waitStrategy?: Wait;
  /** Volumes to mount */
  volumes?: Array<{ source: string; target: string }>;
  /** Network mode */
  networkMode?: string;
  /** Health check command */
  healthCheckCommand?: string[];
  /** Health check interval in milliseconds */
  healthCheckInterval?: number;
}

/**
 * Generic container manager for any Docker image
 *
 * @example
 * ```typescript
 * // Example: RabbitMQ
 * const rabbitmq = new GenericContainerManager({
 *   image: 'rabbitmq:3-management',
 *   ports: [5672, 15672],
 *   env: {
 *     RABBITMQ_DEFAULT_USER: 'guest',
 *     RABBITMQ_DEFAULT_PASS: 'guest',
 *   },
 *   config: {
 *     waitStrategy: Wait.forLogMessage('started TCP listener'),
 *   },
 * });
 *
 * await rabbitmq.start();
 * const amqpUrl = rabbitmq.getPort(5672);
 * ```
 *
 * @example
 * ```typescript
 * // Example: Elasticsearch
 * const elasticsearch = new GenericContainerManager({
 *   image: 'elasticsearch:8.11.0',
 *   ports: [9200, 9300],
 *   env: {
 *     'discovery.type': 'single-node',
 *     'xpack.security.enabled': 'false',
 *   },
 *   config: {
 *     waitStrategy: Wait.forHealthCheck(),
 *   },
 * });
 *
 * await elasticsearch.start();
 * ```
 */
export class GenericContainerManager extends BaseContainerManager<
  StartedTestContainer,
  GenericConnection,
  GenericConfig
> {
  /**
   * Start generic container
   */
  protected async startContainer(): Promise<StartedTestContainer> {
    let container = new GenericContainer(this.config.image);

    // Expose ports
    if (this.config.ports.length > 0) {
      container = container.withExposedPorts(...this.config.ports);
    }

    // Set environment variables
    if (this.config.env) {
      container = container.withEnvironment(this.config.env);
    }

    // Set command
    if (this.config.config?.command) {
      container = container.withCommand(this.config.config.command);
    }

    // Mount volumes
    if (this.config.config?.volumes) {
      for (const volume of this.config.config.volumes) {
        container = container.withBindMounts([
          {
            source: volume.source,
            target: volume.target,
          },
        ]);
      }
    }

    // Set network mode
    if (this.config.config?.networkMode) {
      container = container.withNetworkMode(this.config.config.networkMode);
    }

    // Set wait strategy
    if (this.config.config?.waitStrategy) {
      container = container.withWaitStrategy(this.config.config.waitStrategy);
    }

    return await container.start();
  }

  /**
   * Create connection details
   */
  protected createConnection(container: StartedTestContainer): GenericConnection {
    const ports: Record<string, number> = {};

    for (const port of this.config.ports) {
      ports[`port_${port}`] = container.getMappedPort(port);
    }

    return {
      host: container.getHost(),
      ports,
      env: this.config.env || {},
    };
  }

  /**
   * Get connection string (basic format)
   */
  getConnectionString(): string {
    const conn = this.connection;
    const primaryPort = Object.values(conn.ports)[0];
    return `${conn.host}:${primaryPort}`;
  }

  /**
   * Get specific port mapping
   */
  getPort(containerPort: number): number {
    return this.connection.ports[`port_${containerPort}`] ?? containerPort;
  }

  /**
   * Get URL for a specific port
   */
  getUrl(containerPort: number, protocol: string = 'http'): string {
    const port = this.getPort(containerPort);
    return `${protocol}://${this.connection.host}:${port}`;
  }

  /**
   * Health check using configured command
   */
  async isHealthy(): Promise<boolean> {
    if (!this.config.config?.healthCheckCommand) {
      return await super.isHealthy();
    }

    try {
      const result = await this.exec(this.config.config.healthCheckCommand);
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }

  /**
   * Wait until healthy
   */
  async waitUntilHealthy(timeoutMs: number = 30000): Promise<void> {
    const startTime = Date.now();
    const interval = this.config.config?.healthCheckInterval || 1000;

    while (Date.now() - startTime < timeoutMs) {
      if (await this.isHealthy()) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    throw new Error(`Container failed to become healthy within ${timeoutMs}ms`);
  }
}

/**
 * Factory function for creating generic containers
 */
export function createGenericContainer(
  config: ContainerConfig<GenericConfig>
): GenericContainerManager {
  return new GenericContainerManager(config);
}

/**
 * Predefined container factories for common services
 */

/**
 * Create RabbitMQ container
 */
export function createRabbitMQContainer(
  config?: Partial<ContainerConfig<GenericConfig>>
): GenericContainerManager {
  return createGenericContainer({
    image: 'rabbitmq:3-management-alpine',
    ports: [5672, 15672],
    env: {
      RABBITMQ_DEFAULT_USER: 'guest',
      RABBITMQ_DEFAULT_PASS: 'guest',
    },
    ...config,
  });
}

/**
 * Create Elasticsearch container
 */
export function createElasticsearchContainer(
  config?: Partial<ContainerConfig<GenericConfig>>
): GenericContainerManager {
  return createGenericContainer({
    image: 'elasticsearch:8.11.0',
    ports: [9200, 9300],
    env: {
      'discovery.type': 'single-node',
      'xpack.security.enabled': 'false',
      ES_JAVA_OPTS: '-Xms512m -Xmx512m',
    },
    ...config,
  });
}

/**
 * Create MinIO (S3-compatible) container
 */
export function createMinIOContainer(
  config?: Partial<ContainerConfig<GenericConfig>>
): GenericContainerManager {
  return createGenericContainer({
    image: 'minio/minio:latest',
    ports: [9000, 9001],
    env: {
      MINIO_ROOT_USER: 'minioadmin',
      MINIO_ROOT_PASSWORD: 'minioadmin',
    },
    config: {
      command: ['server', '/data', '--console-address', ':9001'],
    },
    ...config,
  });
}

/**
 * Create Localstack (AWS services) container
 */
export function createLocalstackContainer(
  services: string[] = ['s3', 'sqs', 'sns', 'dynamodb'],
  config?: Partial<ContainerConfig<GenericConfig>>
): GenericContainerManager {
  return createGenericContainer({
    image: 'localstack/localstack:latest',
    ports: [4566],
    env: {
      SERVICES: services.join(','),
      DOCKER_HOST: 'unix:///var/run/docker.sock',
    },
    ...config,
  });
}
