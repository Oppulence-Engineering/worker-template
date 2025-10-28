import http, { type Server } from 'node:http';

import type { Logger } from 'pino';
import { postgraphile, type PostGraphileOptions } from 'postgraphile';

import type { GraphQLConfig } from '../core/config/schema';

export interface PostgraphileServer {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export function createPostgraphileServer(
  databaseUrl: string,
  config: GraphQLConfig,
  logger: Logger
): PostgraphileServer {
  let server: Server | null = null;

  const postgraphileOptions: PostGraphileOptions = {
    dynamicJson: true,
    graphqlRoute: config.path,
    graphiqlRoute: config.graphiqlRoute,
    graphiql: config.graphiql,
    enhanceGraphiql: config.enhanceGraphiql,
    enableQueryBatching: config.enableQueryBatching,
    watchPg: config.watch,
    legacyRelations: config.legacyRelations,
    pgDefaultRole: config.defaultRole,
    jwtSecret: config.jwtSecret,
    jwtPgTypeIdentifier: config.jwtSecret ? config.jwtTokenIdentifier : undefined,
    enableCors: false,
    disableQueryLog: false,
    allowExplain: process.env.NODE_ENV !== 'production',
    extendedErrors: ['hint', 'detail', 'errcode'],
    ignoreRBAC: false,
    ignoreIndexes: false,
    setofFunctionsContainNulls: false,
    showErrorStack: process.env.NODE_ENV !== 'production',
    disableDefaultMutations: false,
    subscriptions: false,
    ownerConnectionString: config.ownerConnectionString,
  };

  if (config.jwtSecret) {
    postgraphileOptions.jwtSecret = config.jwtSecret;
    postgraphileOptions.jwtPgTypeIdentifier = config.jwtTokenIdentifier;
  }

  return {
    async start() {
      if (server) {
        logger.warn('PostGraphile server already running');
        return;
      }

      const middleware = postgraphile(databaseUrl, config.schema, postgraphileOptions);

      server = http.createServer((req, res) => {
        if (req.method === 'GET' && req.url) {
          const [requestPath] = req.url.split('?', 1);
          if (
            requestPath === config.path &&
            config.graphiql &&
            config.graphiqlRoute !== config.path
          ) {
            res.statusCode = 302;
            res.setHeader('Location', config.graphiqlRoute);
            res.end();
            return;
          }
        }
        middleware(req, res);
      });

      await new Promise<void>((resolve) => server!.listen(config.port, resolve));
      logger.info(
        { port: config.port, path: config.path, graphiqlRoute: config.graphiqlRoute },
        'PostGraphile server started'
      );
    },
    async stop() {
      if (!server) {
        return;
      }

      await new Promise<void>((resolve, reject) =>
        server!.close((err) => (err ? reject(err) : resolve()))
      );
      logger.info('PostGraphile server stopped');
      server = null;
    },
  };
}
