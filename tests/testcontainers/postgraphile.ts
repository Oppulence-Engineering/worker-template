/**
 * @fileoverview PostGraphile testcontainer implementation
 * @module tests/testcontainers/postgraphile
 */

import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';

import { BaseContainerManager, type ContainerConfig } from './base';

export interface PostgraphileConnection {
  host: string;
  port: number;
  url: string;
}

export interface PostgraphileConfig {
  /** Database connection string */
  databaseUrl: string;
  /** Graphile schema(s) */
  schema?: string;
  /** Default role when no JWT is provided */
  defaultRole?: string;
  /** Optional JWT secret to sign tokens */
  jwtSecret?: string;
  /** Additional environment variables */
  env?: Record<string, string>;
}

export class PostgraphileContainerManager extends BaseContainerManager<
  StartedTestContainer,
  PostgraphileConnection,
  PostgraphileConfig
> {
  protected async startContainer(): Promise<StartedTestContainer> {
    const { databaseUrl, schema = 'public', defaultRole = 'web_anon', jwtSecret, env = {} } =
      this.config.config ?? {};

    if (!databaseUrl) {
      throw new Error('PostGraphile container requires `databaseUrl` in config.');
    }

    let container = new GenericContainer(this.config.image)
      .withExposedPorts(...this.config.ports)
      .withEnv('DATABASE_URL', databaseUrl)
      .withEnv('SCHEMA', schema)
      .withEnv('DEFAULT_ROLE', defaultRole)
      .withWaitStrategy(Wait.forLogMessage('PostGraphile listening on'));

    if (jwtSecret) {
      container = container.withEnv('JWT_SECRET', jwtSecret);
    }

    for (const [key, value] of Object.entries(env)) {
      container = container.withEnv(key, value);
    }

    return await container.start();
  }

  protected createConnection(container: StartedTestContainer): PostgraphileConnection {
    const host = container.getHost();
    const port = container.getMappedPort(this.config.ports[0]);
    return {
      host,
      port,
      url: `http://${host}:${port}/graphql`,
    };
  }

  getConnectionString(): string {
    return this.connection.url;
  }

  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(this.connection.url, { method: 'OPTIONS' });
      return response.ok;
    } catch {
      return false;
    }
  }
}

export function createPostgraphileContainer(
  config: ContainerConfig<PostgraphileConfig>
): PostgraphileContainerManager {
  return new PostgraphileContainerManager({
    image: 'graphile/postgraphile:latest',
    ports: [5000],
    ...config,
  });
}
