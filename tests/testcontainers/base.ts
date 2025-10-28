/**
 * @fileoverview Generic testcontainer management system
 * @module tests/testcontainers/base
 */

import type { StartedTestContainer, GenericContainer } from 'testcontainers';

/**
 * Generic container configuration interface
 * @template TConfig - Container-specific configuration type
 */
export interface ContainerConfig<TConfig = Record<string, unknown>> {
  /** Container image name and tag */
  image: string;
  /** Exposed ports */
  ports: number[];
  /** Environment variables */
  env?: Record<string, string>;
  /** Wait strategy timeout in milliseconds */
  timeout?: number;
  /** Additional container-specific configuration */
  config?: TConfig;
}

/**
 * Generic container instance interface
 * @template TContainer - Started container type
 * @template TConnection - Connection details type
 */
export interface IContainerInstance<
  TContainer extends StartedTestContainer = StartedTestContainer,
  TConnection = unknown,
> {
  /** Started container instance */
  readonly container: TContainer;
  /** Connection details */
  readonly connection: TConnection;
  /** Stop and cleanup the container */
  stop(): Promise<void>;
  /** Get connection string/URL */
  getConnectionString(): string;
  /** Health check */
  isHealthy(): Promise<boolean>;
}

/**
 * Abstract base class for testcontainer management with generics
 *
 * @template TContainer - Started container type
 * @template TConnection - Connection details type
 * @template TConfig - Configuration type
 *
 * @example
 * ```typescript
 * class PostgresContainer extends BaseContainerManager<
 *   StartedPostgreSqlContainer,
 *   PostgresConnection,
 *   PostgresConfig
 * > {
 *   async start() {
 *     const container = await new PostgreSqlContainer()
 *       .withDatabase(this.config.database)
 *       .start();
 *     return container;
 *   }
 *
 *   createConnection(container) {
 *     return {
 *       host: container.getHost(),
 *       port: container.getPort(),
 *       // ...
 *     };
 *   }
 * }
 * ```
 */
export abstract class BaseContainerManager<
  TContainer extends StartedTestContainer = StartedTestContainer,
  TConnection = unknown,
  TConfig = Record<string, unknown>,
> implements IContainerInstance<TContainer, TConnection>
{
  protected _container: TContainer | null = null;
  protected _connection: TConnection | null = null;

  /**
   * Constructor
   * @param config - Container configuration
   */
  constructor(protected readonly config: ContainerConfig<TConfig>) {}

  /**
   * Start the container
   * Must be implemented by subclasses
   */
  protected abstract startContainer(): Promise<TContainer>;

  /**
   * Create connection details from started container
   * Must be implemented by subclasses
   */
  protected abstract createConnection(container: TContainer): TConnection;

  /**
   * Get the started container
   */
  get container(): TContainer {
    if (!this._container) {
      throw new Error('Container not started. Call start() first.');
    }
    return this._container;
  }

  /**
   * Get connection details
   */
  get connection(): TConnection {
    if (!this._connection) {
      throw new Error('Connection not initialized. Call start() first.');
    }
    return this._connection;
  }

  /**
   * Initialize and start the container
   */
  async start(): Promise<IContainerInstance<TContainer, TConnection>> {
    if (this._container) {
      console.warn('Container already started');
      return this;
    }

    console.log(`Starting container: ${this.config.image}`);
    const startTime = Date.now();

    try {
      this._container = await this.startContainer();
      this._connection = this.createConnection(this._container);

      const duration = Date.now() - startTime;
      console.log(`Container started in ${duration}ms`);

      return this;
    } catch (error) {
      console.error('Failed to start container:', error);
      throw error;
    }
  }

  /**
   * Stop and cleanup the container
   */
  async stop(): Promise<void> {
    if (!this._container) {
      return;
    }

    console.log(`Stopping container: ${this.config.image}`);

    try {
      await this._container.stop();
      this._container = null;
      this._connection = null;
      console.log('Container stopped');
    } catch (error) {
      console.error('Error stopping container:', error);
      throw error;
    }
  }

  /**
   * Get connection string
   * Override in subclasses for specific connection string formats
   */
  abstract getConnectionString(): string;

  /**
   * Health check
   * Override in subclasses for specific health checks
   */
  async isHealthy(): Promise<boolean> {
    return this._container !== null;
  }

  /**
   * Execute command in container
   */
  async exec(command: string[]): Promise<{ output: string; exitCode: number }> {
    if (!this._container) {
      throw new Error('Container not started');
    }

    const result = await this._container.exec(command);
    return result;
  }

  /**
   * Get container logs
   */
  async getLogs(): Promise<string> {
    if (!this._container) {
      throw new Error('Container not started');
    }

    const stream = await this._container.logs();
    return stream.toString();
  }
}

/**
 * Container registry for managing multiple containers
 *
 * @template TContainers - Map of container names to container instances
 *
 * @example
 * ```typescript
 * const registry = new ContainerRegistry<{
 *   postgres: PostgresContainer,
 *   redis: RedisContainer,
 *   mongodb: MongoContainer
 * }>();
 *
 * await registry.register('postgres', postgresContainer);
 * await registry.startAll();
 *
 * const postgres = registry.get('postgres');
 * ```
 */
export class ContainerRegistry<
  TContainers extends Record<string, IContainerInstance> = Record<string, IContainerInstance>,
> {
  private containers = new Map<keyof TContainers, IContainerInstance>();

  /**
   * Register a container
   */
  register<K extends keyof TContainers>(name: K, container: TContainers[K]): this {
    if (this.containers.has(name)) {
      throw new Error(`Container '${String(name)}' already registered`);
    }

    this.containers.set(name, container);
    return this;
  }

  /**
   * Get a container by name
   */
  get<K extends keyof TContainers>(name: K): TContainers[K] {
    const container = this.containers.get(name);
    if (!container) {
      throw new Error(`Container '${String(name)}' not found`);
    }
    return container as TContainers[K];
  }

  /**
   * Check if container exists
   */
  has(name: keyof TContainers): boolean {
    return this.containers.has(name);
  }

  /**
   * Start all registered containers
   */
  async startAll(): Promise<void> {
    console.log(`Starting ${this.containers.size} containers...`);

    const startPromises = Array.from(this.containers.entries()).map(async ([name, container]) => {
      console.log(`Starting: ${String(name)}`);
      await container.container; // Ensure container is started
      return name;
    });

    await Promise.all(startPromises);
    console.log('All containers started');
  }

  /**
   * Stop all registered containers
   */
  async stopAll(): Promise<void> {
    console.log(`Stopping ${this.containers.size} containers...`);

    const stopPromises = Array.from(this.containers.values()).map((container) => container.stop());

    await Promise.all(stopPromises);
    this.containers.clear();
    console.log('All containers stopped');
  }

  /**
   * Get all container names
   */
  getNames(): Array<keyof TContainers> {
    return Array.from(this.containers.keys());
  }

  /**
   * Get number of registered containers
   */
  get size(): number {
    return this.containers.size;
  }
}

/**
 * Helper to create a container registry with type inference
 */
export function createContainerRegistry<
  TContainers extends Record<string, IContainerInstance>,
>(): ContainerRegistry<TContainers> {
  return new ContainerRegistry<TContainers>();
}
