/**
 * @fileoverview PostgREST testcontainer implementation
 * @module tests/testcontainers/postgrest
 */

import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';

import { BaseContainerManager, type ContainerConfig } from './base';

export interface PostgrestConnection {
  host: string;
  port: number;
  url: string;
}

export interface PostgrestConfig {
  /** Connection string to the backing PostgreSQL database */
  dbUri: string;
  /** Schemas exposed by PostgREST */
  dbSchema?: string;
  /** Role used by PostgREST when no JWT is provided */
  dbAnonRole?: string;
  /** Optional JWT secret for authenticated requests */
  jwtSecret?: string;
  /** Extra environment variables passed to the container */
  env?: Record<string, string>;
}

export class PostgrestContainerManager extends BaseContainerManager<
  StartedTestContainer,
  PostgrestConnection,
  PostgrestConfig
> {
  protected async startContainer(): Promise<StartedTestContainer> {
    const { dbUri, dbSchema = 'public', dbAnonRole = 'anon', jwtSecret, env = {} } =
      this.config.config ?? {};

    if (!dbUri) {
      throw new Error('PostgREST container requires `dbUri` in config.');
    }

    let container = new GenericContainer(this.config.image)
      .withExposedPorts(...this.config.ports)
      .withEnv('PGRST_DB_URI', dbUri)
      .withEnv('PGRST_DB_SCHEMA', dbSchema)
      .withEnv('PGRST_DB_ANON_ROLE', dbAnonRole)
      .withWaitStrategy(Wait.forLogMessage('Config reloaded'));

    if (jwtSecret) {
      container = container.withEnv('PGRST_JWT_SECRET', jwtSecret);
    }

    for (const [key, value] of Object.entries(env)) {
      container = container.withEnv(key, value);
    }

    return await container.start();
  }

  protected createConnection(container: StartedTestContainer): PostgrestConnection {
    const host = container.getHost();
    const port = container.getMappedPort(this.config.ports[0]);
    return {
      host,
      port,
      url: `http://${host}:${port}`,
    };
  }

  getConnectionString(): string {
    return this.connection.url;
  }

  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`${this.connection.url}/`, { method: 'GET' });
      return response.ok;
    } catch {
      return false;
    }
  }
}

export function createPostgrestContainer(
  config: ContainerConfig<PostgrestConfig>
): PostgrestContainerManager {
  return new PostgrestContainerManager({
    image: 'postgrest/postgrest:latest',
    ports: [3000],
    ...config,
  });
}
