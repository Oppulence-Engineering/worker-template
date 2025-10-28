/**
 * @fileoverview OpenTelemetry metrics collection with Prometheus exporter
 * @module core/instrumentation/metrics
 */

import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { Resource } from '@opentelemetry/resources';
import {
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';
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
 * Scheduler metrics collector
 */
export class SchedulerMetrics {
  private readonly meter: Meter;
  private readonly executions: Counter;
  private readonly duration: Histogram;
  private readonly failures: Counter;
  private readonly reconciliation: Counter;
  private readonly validationFailures: Counter;
  private readonly customCounters = new Map<string, Counter>();

  constructor(serviceName: string) {
    this.meter = getMeter('scheduler', '1.0.0');

    this.executions = this.meter.createCounter('scheduler_executions_total', {
      description: 'Total number of scheduled job executions',
      unit: '1',
    });

    this.duration = this.meter.createHistogram('scheduler_execution_duration_seconds', {
      description: 'Scheduled job execution duration',
      unit: 's',
    });

    this.failures = this.meter.createCounter('scheduler_execution_failures_total', {
      description: 'Total number of scheduled job execution failures',
      unit: '1',
    });

    this.reconciliation = this.meter.createCounter('scheduler_reconciliation_events_total', {
      description: 'Number of reconciliation events executed',
      unit: '1',
    });

    this.validationFailures = this.meter.createCounter('scheduler_validation_failures_total', {
      description: 'Number of schedule payload validation failures',
      unit: '1',
    });
  }

  recordExecution(
    jobName: string,
    durationMs: number,
    success: boolean,
    backfilled: boolean
  ): void {
    const labels = { job_name: jobName, outcome: success ? 'success' : 'failure', backfilled };
    this.executions.add(1, labels);
    this.duration.record(durationMs / 1000, labels);

    if (!success) {
      this.failures.add(1, { job_name: jobName, backfilled });
    }
  }

  recordReconciliation(action: 'inserted' | 'stale', count: number): void {
    if (count > 0) {
      this.reconciliation.add(count, { action });
    }
  }

  recordValidationFailure(jobName: string, reason: string): void {
    this.validationFailures.add(1, { job_name: jobName, reason });
  }

  recordCustomMetrics(jobName: string, metrics: Record<string, number>): void {
    for (const [key, value] of Object.entries(metrics)) {
      if (!Number.isFinite(value)) {
        continue;
      }

      this.getCustomCounter(key).add(value, { job_name: jobName });
    }
  }

  private getCustomCounter(key: string): Counter {
    const metricName = this.toMetricName(key);
    const existing = this.customCounters.get(metricName);
    if (existing) {
      return existing;
    }

    const counter = this.meter.createCounter(metricName, {
      description: `Custom metric emitted by scheduled jobs (${metricName})`,
      unit: '1',
    });
    this.customCounters.set(metricName, counter);
    return counter;
  }

  private toMetricName(key: string): string {
    return `scheduler_custom_${key.replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase()}`;
  }
}

/**
 * Workflow metrics collector
 */
export class WorkflowMetrics {
  private readonly meter: Meter;
  private readonly executions: Counter;
  private readonly duration: Histogram;
  private readonly compensation: Counter;
  private readonly stepExecutions: Counter;

  constructor(serviceName: string) {
    this.meter = getMeter('workflow', '1.0.0');

    this.executions = this.meter.createCounter('workflow_executions_total', {
      description: 'Total number of workflow executions',
      unit: '1',
    });

    this.duration = this.meter.createHistogram('workflow_duration_seconds', {
      description: 'Workflow execution duration',
      unit: 's',
    });

    this.compensation = this.meter.createCounter('workflow_compensation_total', {
      description: 'Total number of workflow compensation steps executed',
      unit: '1',
    });

    this.stepExecutions = this.meter.createCounter('workflow_step_total', {
      description: 'Total number of workflow steps executed',
      unit: '1',
    });
  }

  recordWorkflowCompletion(jobName: string, durationMs: number, outcome: 'success' | 'failure'): void {
    this.executions.add(1, { job_name: jobName, outcome });
    this.duration.record(durationMs / 1000, { job_name: jobName, outcome });
  }

  recordStep(jobName: string, stepId: string, outcome: 'success' | 'failure'): void {
    this.stepExecutions.add(1, { job_name: jobName, step_id: stepId, outcome });
  }

  recordCompensation(jobName: string, stepId: string): void {
    this.compensation.add(1, { job_name: jobName, step_id: stepId });
  }
}

/**
 * Create all metrics collectors
 */
export function createMetricsCollectors(serviceName: string): {
  jobMetrics: JobMetrics;
  dbMetrics: DatabaseMetrics;
  httpMetrics: HttpMetrics;
  schedulerMetrics: SchedulerMetrics;
  workflowMetrics: WorkflowMetrics;
} {
  return {
    jobMetrics: new JobMetrics(serviceName),
    dbMetrics: new DatabaseMetrics(),
    httpMetrics: new HttpMetrics(),
    schedulerMetrics: new SchedulerMetrics(serviceName),
    workflowMetrics: new WorkflowMetrics(serviceName),
  };
}
