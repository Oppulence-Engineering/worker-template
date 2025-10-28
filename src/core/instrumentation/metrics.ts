/**
 * @fileoverview OpenTelemetry metrics collection with Prometheus exporter
 * @module core/instrumentation/metrics
 */

import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { Resource } from '@opentelemetry/resources';
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { metrics, type Counter, type Histogram, type Meter } from '@opentelemetry/api';

import type { ObservabilityConfig } from '../config/schema';

/**
 * Setup OpenTelemetry metrics with Prometheus exporter
 *
 * @param config - Observability configuration
 * @returns Prometheus exporter instance
 */
export function setupMetrics(config: ObservabilityConfig): PrometheusExporter | null {
  if (!config.metrics.enabled) {
    return null;
  }

  // Create resource
  const resource = new Resource({
    [SEMRESATTRS_SERVICE_NAME]: config.serviceName,
    [SEMRESATTRS_SERVICE_VERSION]: config.serviceVersion,
  });

  // Create Prometheus exporter
  const prometheusExporter = new PrometheusExporter({
    port: config.metrics.port,
    endpoint: config.metrics.path,
  });

  // Create meter provider - PrometheusExporter acts as its own reader
  // Note: Type assertion needed due to version incompatibility with selectCardinalityLimit
  const meterProvider = new MeterProvider({
    resource,
    readers: [prometheusExporter] as unknown as import('@opentelemetry/sdk-metrics').MetricReader[],
  });

  // Set global meter provider
  metrics.setGlobalMeterProvider(meterProvider);

  return prometheusExporter;
}

/**
 * Get meter instance
 *
 * @param name - Meter name
 * @param version - Meter version
 * @returns Meter instance
 */
export function getMeter(name: string, version: string = '1.0.0'): Meter {
  return metrics.getMeter(name, version);
}

/**
 * Job metrics collector
 */
export class JobMetrics {
  private readonly meter: Meter;
  private readonly jobsProcessed: Counter;
  private readonly jobDuration: Histogram;
  private readonly jobErrors: Counter;
  private readonly jobRetries: Counter;
  private readonly activeJobs: Counter;

  constructor(serviceName: string) {
    this.meter = getMeter('graphile-worker', '1.0.0');

    // Jobs processed counter
    this.jobsProcessed = this.meter.createCounter('jobs_processed_total', {
      description: 'Total number of jobs processed',
      unit: '1',
    });

    // Job duration histogram
    this.jobDuration = this.meter.createHistogram('job_duration_seconds', {
      description: 'Job execution duration in seconds',
      unit: 's',
    });

    // Job errors counter
    this.jobErrors = this.meter.createCounter('job_errors_total', {
      description: 'Total number of job errors',
      unit: '1',
    });

    // Job retries counter
    this.jobRetries = this.meter.createCounter('job_retries_total', {
      description: 'Total number of job retries',
      unit: '1',
    });

    // Active jobs gauge (using counter with inc/dec)
    this.activeJobs = this.meter.createCounter('active_jobs', {
      description: 'Number of currently active jobs',
      unit: '1',
    });
  }

  /**
   * Record job completion
   */
  recordJobProcessed(jobName: string, status: 'success' | 'failure'): void {
    this.jobsProcessed.add(1, { job_name: jobName, status });
  }

  /**
   * Record job duration
   */
  recordJobDuration(jobName: string, durationMs: number): void {
    this.jobDuration.record(durationMs / 1000, { job_name: jobName });
  }

  /**
   * Record job error
   */
  recordJobError(jobName: string, errorType: string): void {
    this.jobErrors.add(1, { job_name: jobName, error_type: errorType });
  }

  /**
   * Record job retry
   */
  recordJobRetry(jobName: string, attemptNumber: number): void {
    this.jobRetries.add(1, { job_name: jobName, attempt: attemptNumber });
  }

  /**
   * Increment active jobs
   */
  incrementActiveJobs(jobName: string): void {
    this.activeJobs.add(1, { job_name: jobName });
  }

  /**
   * Decrement active jobs
   */
  decrementActiveJobs(jobName: string): void {
    this.activeJobs.add(-1, { job_name: jobName });
  }
}

/**
 * Database metrics collector
 */
export class DatabaseMetrics {
  private readonly meter: Meter;
  private readonly queryDuration: Histogram;
  private readonly queryErrors: Counter;
  private readonly connectionPoolSize: Counter;

  constructor() {
    this.meter = getMeter('database', '1.0.0');

    this.queryDuration = this.meter.createHistogram('db_query_duration_seconds', {
      description: 'Database query duration in seconds',
      unit: 's',
    });

    this.queryErrors = this.meter.createCounter('db_query_errors_total', {
      description: 'Total number of database query errors',
      unit: '1',
    });

    this.connectionPoolSize = this.meter.createCounter('db_connection_pool_size', {
      description: 'Database connection pool size',
      unit: '1',
    });
  }

  /**
   * Record query duration
   */
  recordQueryDuration(operation: string, durationMs: number): void {
    this.queryDuration.record(durationMs / 1000, { operation });
  }

  /**
   * Record query error
   */
  recordQueryError(operation: string, errorType: string): void {
    this.queryErrors.add(1, { operation, error_type: errorType });
  }

  /**
   * Set connection pool size
   */
  setConnectionPoolSize(size: number): void {
    this.connectionPoolSize.add(size);
  }
}

/**
 * HTTP metrics collector
 */
export class HttpMetrics {
  private readonly meter: Meter;
  private readonly requestDuration: Histogram;
  private readonly requestsTotal: Counter;
  private readonly requestErrors: Counter;

  constructor() {
    this.meter = getMeter('http', '1.0.0');

    this.requestDuration = this.meter.createHistogram('http_request_duration_seconds', {
      description: 'HTTP request duration in seconds',
      unit: 's',
    });

    this.requestsTotal = this.meter.createCounter('http_requests_total', {
      description: 'Total number of HTTP requests',
      unit: '1',
    });

    this.requestErrors = this.meter.createCounter('http_request_errors_total', {
      description: 'Total number of HTTP request errors',
      unit: '1',
    });
  }

  /**
   * Record HTTP request
   */
  recordRequest(method: string, path: string, statusCode: number, durationMs: number): void {
    this.requestsTotal.add(1, { method, path, status: statusCode });
    this.requestDuration.record(durationMs / 1000, { method, path });

    if (statusCode >= 400) {
      this.requestErrors.add(1, { method, path, status: statusCode });
    }
  }
}

/**
 * Create all metrics collectors
 */
export function createMetricsCollectors(serviceName: string): {
  jobMetrics: JobMetrics;
  dbMetrics: DatabaseMetrics;
  httpMetrics: HttpMetrics;
} {
  return {
    jobMetrics: new JobMetrics(serviceName),
    dbMetrics: new DatabaseMetrics(),
    httpMetrics: new HttpMetrics(),
  };
}
