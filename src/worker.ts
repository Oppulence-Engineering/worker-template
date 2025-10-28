/**
 * @fileoverview Main worker entry point
 * @module worker
 */

import { run, type Runner, type RunnerOptions } from 'graphile-worker';
import { Pool } from 'pg';

import { getConfig, getDatabaseUrl } from './core/config';
import { createLogger } from './core/instrumentation/logger';
import { setupTracing } from './core/instrumentation/tracing';
import { setupMetrics, createMetricsCollectors } from './core/instrumentation/metrics';
import { JobRegistry } from './core/worker/JobRegistry';

// Import example jobs
import { EmailJob } from './jobs/examples/EmailJob';

/**
 * Graceful shutdown handler
 */
class GracefulShutdown {
  private shutdownInProgress = false;

  constructor(
    private runner: Runner,
    private logger: ReturnType<typeof createLogger>,
    private timeout: number = 30000
  ) {}

  async shutdown(signal: string): Promise<void> {
    if (this.shutdownInProgress) {
      this.logger.warn('Shutdown already in progress, ignoring signal');
      return;
    }

    this.shutdownInProgress = true;
    this.logger.info({ signal }, 'Starting graceful shutdown');

    const shutdownTimer = setTimeout(() => {
      this.logger.error('Graceful shutdown timeout, forcing exit');
      process.exit(1);
    }, this.timeout);

    try {
      this.logger.info('Stopping worker runner');
      await this.runner.stop();

      clearTimeout(shutdownTimer);
      this.logger.info('Graceful shutdown complete');
      process.exit(0);
    } catch (error) {
      this.logger.error({ error }, 'Error during shutdown');
      process.exit(1);
    }
  }

  setupHandlers(): void {
    process.on('SIGTERM', () => this.shutdown('SIGTERM'));
    process.on('SIGINT', () => this.shutdown('SIGINT'));

    process.on('uncaughtException', (error) => {
      this.logger.fatal({ error }, 'Uncaught exception');
      this.shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason) => {
      this.logger.fatal({ reason }, 'Unhandled rejection');
      this.shutdown('unhandledRejection');
    });
  }
}

/**
 * Main worker function
 */
async function main(): Promise<void> {
  // Load configuration
  const config = getConfig();

  // Create logger
  const logger = createLogger(config.observability.logging, config.observability.serviceName);
  logger.info({ config: { ...config, database: { ...config.database, password: '***' } } }, 'Starting Graphile Worker');

  // Setup OpenTelemetry
  const tracingSDK = setupTracing(config.observability);
  if (tracingSDK) {
    tracingSDK.start();
    logger.info('OpenTelemetry tracing initialized');
  }

  const metricsExporter = setupMetrics(config.observability);
  if (metricsExporter) {
    logger.info({ port: config.observability.metrics.port }, 'OpenTelemetry metrics initialized');
  }

  // Create metrics collectors
  const { jobMetrics, dbMetrics } = createMetricsCollectors(config.observability.serviceName);
  logger.info('Metrics collectors created');

  // Create database pool
  const pool = new Pool({
    connectionString: getDatabaseUrl(config),
    max: config.database.maxConnections,
    idleTimeoutMillis: config.database.idleTimeoutMillis,
    connectionTimeoutMillis: config.database.connectionTimeoutMillis,
  });

  pool.on('error', (err) => {
    logger.error({ error: err }, 'Unexpected database pool error');
  });

  pool.on('connect', () => {
    logger.debug('New database connection established');
  });

  logger.info('Database pool created');

  // Test database connection
  try {
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    logger.info('Database connection successful');
  } catch (error) {
    logger.fatal({ error }, 'Failed to connect to database');
    process.exit(1);
  }

  // Create job registry
  const registry = new JobRegistry();
  registry.setLogger(logger);

  // Register jobs
  logger.info('Registering jobs...');
  registry.register(new EmailJob());
  // Add more jobs here:
  // registry.register(new DataProcessingJob());
  // registry.register(new WebhookJob());

  const stats = registry.getStats();
  logger.info(stats, 'Jobs registered');

  // Configure Graphile Worker
  const runnerOptions: RunnerOptions = {
    connectionString: getDatabaseUrl(config),
    concurrency: config.worker.concurrency,
    pollInterval: config.worker.pollInterval,
    schema: config.worker.schema,
    taskList: registry.getTaskList(),
    noHandleSignals: config.worker.noHandleSignals,
  };

  // Start worker
  logger.info(
    {
      concurrency: config.worker.concurrency,
      pollInterval: config.worker.pollInterval,
    },
    'Starting Graphile Worker runner'
  );

  const runner = await run(runnerOptions);
  logger.info('Graphile Worker started successfully');

  // Register event listeners
  runner.events.on('job:start', ({ job }) => {
    logger.info({ jobId: job.id, taskIdentifier: job.task_identifier }, 'Job started');
    jobMetrics.incrementActiveJobs(job.task_identifier);
  });

  runner.events.on('job:success', ({ job }) => {
    const duration = Date.now() - new Date(job.run_at).getTime();
    logger.info(
      {
        jobId: job.id,
        taskIdentifier: job.task_identifier,
        duration,
      },
      'Job completed'
    );
    jobMetrics.recordJobProcessed(job.task_identifier, 'success');
    jobMetrics.recordJobDuration(job.task_identifier, duration);
    jobMetrics.decrementActiveJobs(job.task_identifier);
  });

  runner.events.on('job:error', ({ job, error }) => {
    const err = error as Error;
    logger.error(
      {
        jobId: job.id,
        taskIdentifier: job.task_identifier,
        error: err.message,
      },
      'Job failed'
    );
    jobMetrics.recordJobError(job.task_identifier, err.name);
    jobMetrics.recordJobProcessed(job.task_identifier, 'failure');
    jobMetrics.decrementActiveJobs(job.task_identifier);

    if (job.attempts < job.max_attempts) {
      jobMetrics.recordJobRetry(job.task_identifier, job.attempts + 1);
    }
  });

  runner.events.on('job:complete', ({ job }) => {
    logger.debug(
      {
        jobId: job.id,
        taskIdentifier: job.task_identifier,
      },
      'Job complete (all attempts exhausted or succeeded)'
    );
  });

  // Setup graceful shutdown
  const shutdown = new GracefulShutdown(runner, logger);
  shutdown.setupHandlers();

  logger.info('Worker is ready to process jobs');
}

// Start the worker
main().catch((error) => {
  console.error('Fatal error starting worker:', error);
  process.exit(1);
});
