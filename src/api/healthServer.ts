import http, { type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import type { Logger } from 'pino';

import type { HealthCheckConfig } from '../core/config/schema';

export interface HealthServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  setReadiness(isReady: boolean): void;
  setLiveness(isLive: boolean): void;
}

interface HealthStatus {
  ready: boolean;
  live: boolean;
}

type HealthRoute = 'health' | 'readiness' | 'liveness';

function createPayload(status: HealthStatus) {
  const responseStatus = status.ready && status.live ? 'ok' : 'degraded';
  return JSON.stringify({
    status: responseStatus,
    checks: {
      readiness: { status: status.ready ? 'pass' : 'fail' },
      liveness: { status: status.live ? 'pass' : 'fail' },
    },
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
}

function resolveRoute(url: string | undefined, config: HealthCheckConfig): HealthRoute | null {
  if (!url) return null;
  const [path] = url.split('?', 1);

  if (path === config.path) return 'health';
  if (path === config.readinessPath) return 'readiness';
  if (path === config.livenessPath) return 'liveness';

  return null;
}

function writeJsonResponse(
  res: ServerResponse,
  statusCode: number,
  payload: string,
  method: string
): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');

  if (method === 'HEAD') {
    res.end();
    return;
  }

  res.end(payload);
}

export function createHealthServer(
  config: HealthCheckConfig,
  logger: Logger
): HealthServer {
  let server: Server | null = null;
  const status: HealthStatus = {
    ready: false,
    live: true,
  };

  const requestHandler = (req: IncomingMessage, res: ServerResponse) => {
    const method = req.method ?? 'GET';

    if (!['GET', 'HEAD'].includes(method)) {
      res.statusCode = 405;
      res.setHeader('Allow', 'GET, HEAD');
      res.end();
      return;
    }

    const route = resolveRoute(req.url, config);
    if (!route) {
      res.statusCode = 404;
      res.end();
      return;
    }

    const payload = createPayload(status);

    if (route === 'readiness') {
      writeJsonResponse(res, status.ready ? 200 : 503, payload, method);
      return;
    }

    if (route === 'liveness') {
      writeJsonResponse(res, status.live ? 200 : 503, payload, method);
      return;
    }

    // Aggregate health endpoint: fail if either check fails.
    const overallStatusCode = status.ready && status.live ? 200 : 503;
    writeJsonResponse(res, overallStatusCode, payload, method);
  };

  return {
    async start() {
      if (server) {
        logger.warn('Health server already running');
        return;
      }

      server = http.createServer(requestHandler);

      server.on('clientError', (err, socket) => {
        logger.warn({ error: err }, 'Health server client error');
        socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
      });

      await new Promise<void>((resolve, reject) => {
        server!.once('error', reject);
        server!.listen(config.port, () => {
          server!.off('error', reject);
          resolve();
        });
      });

      logger.info(
        {
          port: config.port,
          endpoints: {
            health: config.path,
            readiness: config.readinessPath,
            liveness: config.livenessPath,
          },
        },
        'Health server started'
      );
    },
    async stop() {
      if (!server) {
        return;
      }

      await new Promise<void>((resolve, reject) => {
        server!.close((err) => {
          if (err) return reject(err);
          resolve();
        });
      });

      server = null;
      logger.info('Health server stopped');
    },
    setReadiness(isReady: boolean) {
      if (status.ready === isReady) return;
      status.ready = isReady;
      logger.debug({ readiness: status.ready }, 'Updated readiness status');
    },
    setLiveness(isLive: boolean) {
      if (status.live === isLive) return;
      status.live = isLive;
      logger.debug({ liveness: status.live }, 'Updated liveness status');
    },
  };
}
