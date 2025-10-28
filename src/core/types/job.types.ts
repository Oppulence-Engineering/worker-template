/**
 * @fileoverview Job-related generic types for type-safe job management
 * @module core/types/job
 */

import type {
  AsyncFunction,
  Awaitable,
  Brand,
  Constructor,
  Prettify,
  Result as _Result,
} from './common.types';
import type { FeatureFlagService } from '../featureFlags/FeatureFlagService';
import type { Span } from '@opentelemetry/api';
import type { JobHelpers, Logger as GraphileLogger, Task } from 'graphile-worker';
import type { z } from 'zod';


export type { JobHelpers } from 'graphile-worker';

/**
 * Job identifier - branded string for type safety
 */
export type JobId = Brand<string, 'JobId'>;

/**
 * Job name - branded string for type safety
 */
export type JobName = Brand<string, 'JobName'>;

/**
 * Queue name - branded string for type safety
 */
export type QueueName = Brand<string, 'QueueName'>;

/**
 * Correlation ID for distributed tracing
 */
export type CorrelationId = Brand<string, 'CorrelationId'>;

/**
 * Job priority levels
 */
export type JobPriority = -5 | -4 | -3 | -2 | -1 | 0 | 1 | 2 | 3 | 4 | 5;

/**
 * Job status enumeration
 */
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'retrying';

/**
 * Job key modes for deduplication
 */
export type JobKeyMode = 'replace' | 'preserve_run_at' | 'unsafe_dedupe';

/**
 * Generic job configuration interface
 * @template TOptions - Additional job-specific options
 */
export interface JobConfig<TOptions = Record<string, unknown>> {
  /** Maximum number of retry attempts */
  maxAttempts?: number;
  /** Job priority (-5 to 5) */
  priority?: JobPriority;
  /** Queue name for job routing */
  queue?: QueueName;
  /** Scheduled run time */
  runAt?: Date;
  /** Unique job key for deduplication */
  jobKey?: string;
  /** Job key deduplication mode */
  jobKeyMode?: JobKeyMode;
  /** Additional job-specific options */
  options?: TOptions;
}

/**
 * Enhanced job context with full typing
 * @template TMetadata - Additional metadata type
 */
export interface JobContext<TMetadata = Record<string, unknown>> {
  /** Scoped logger with correlation ID */
  logger: GraphileLogger;
  /** Unique correlation ID for tracing */
  correlationId: CorrelationId;
  /** OpenTelemetry span for distributed tracing */
  span: Span;
  /** Current attempt number (1-indexed) */
  attemptNumber: number;
  /** Maximum configured attempts */
  maxAttempts: number;
  /** Job ID */
  jobId: JobId;
  /** Job name */
  jobName: JobName;
  /** Job creation timestamp */
  createdAt: Date;
  /** Job start timestamp */
  startedAt: Date;
  /** Additional metadata */
  metadata: TMetadata;
  /** Graphile Worker helpers */
  helpers: JobHelpers;
}

/**
 * Retry strategy interface
 * @template TConfig - Strategy configuration type
 */
export interface RetryStrategy<TConfig = unknown> {
  /** Calculate backoff delay in milliseconds */
  calculateDelay(attemptNumber: number, config: TConfig): number;
  /** Determine if retry should occur */
  shouldRetry(attemptNumber: number, maxAttempts: number, error: Error): boolean;
  /** Get strategy name */
  readonly name: string;
}

/**
 * Exponential backoff configuration
 */
export interface ExponentialBackoffConfig {
  /** Base delay in milliseconds */
  baseDelay: number;
  /** Maximum delay in milliseconds */
  maxDelay: number;
  /** Exponential factor */
  factor: number;
  /** Random jitter to prevent thundering herd */
  jitter: boolean;
}

/**
 * Linear backoff configuration
 */
export interface LinearBackoffConfig {
  /** Base delay in milliseconds */
  baseDelay: number;
  /** Maximum delay in milliseconds */
  maxDelay: number;
}

/**
 * Schedule configuration for cron-style jobs
 */
export interface ScheduleConfig {
  /** Cron expression */
  cron: string;
  /** Timezone for schedule */
  timezone?: string;
  /** Whether to run on startup */
  runOnStartup?: boolean;
}

/**
 * Batch processing configuration
 * @template TItem - Type of items in batch
 */
export interface BatchConfig<TItem = unknown> {
  /** Batch size */
  batchSize: number;
  /** Maximum wait time for batch completion */
  maxWaitTime: number;
  /** Error handling strategy */
  errorStrategy: 'fail-fast' | 'continue' | 'collect';
  /** Item processor function */
  processor: AsyncFunction<[TItem], unknown>;
}

/**
 * Job execution result with metadata
 * @template TResult - Result data type
 */
export interface JobExecutionResult<TResult = unknown> {
  /** Execution result data */
  data: TResult;
  /** Execution duration in milliseconds */
  duration: number;
  /** Whether execution was successful */
  success: boolean;
  /** Memory usage statistics */
  memory?: NodeJS.MemoryUsage;
  /** Custom metrics */
  metrics?: Record<string, number>;
}

/**
 * Job error with enhanced context
 */
export interface JobError extends Error {
  /** Job ID where error occurred */
  jobId: JobId;
  /** Job name */
  jobName: JobName;
  /** Attempt number when error occurred */
  attemptNumber: number;
  /** Whether error is retryable */
  retryable: boolean;
  /** Original error cause */
  cause?: Error;
  /** Error context data */
  context?: Record<string, unknown>;
}

/**
 * Base job interface with generic payload and result
 * @template TPayload - Zod schema type for payload validation
 * @template TResult - Job execution result type
 * @template TMetadata - Additional context metadata type
 */
export interface IJob<
  TPayload extends z.ZodType = z.ZodType,
  TResult = void,
  TMetadata = Record<string, unknown>,
> {
  /** Unique job name */
  readonly jobName: JobName;
  /** Payload validation schema */
  readonly schema: TPayload;
  /** Default job configuration */
  readonly defaultConfig: Partial<JobConfig>;

  /**
   * Execute the job with validated payload
   * @param payload - Validated job payload
   * @param context - Job execution context
   * @returns Job execution result
   */
  execute(payload: z.infer<TPayload>, context: JobContext<TMetadata>): Promise<TResult>;

  /**
   * Validate job payload against schema
   * @param payload - Raw payload to validate
   * @returns Validated payload
   */
  validate(payload: unknown): z.infer<TPayload>;

  /**
   * Get Graphile Worker task function
   * @returns Task function for worker registration
   */
  getTaskFunction(): Task;

  /**
   * Get job configuration with optional overrides
   * @param overrides - Configuration overrides
   * @returns Complete job configuration
   */
  getConfig(overrides?: Partial<JobConfig>): JobConfig;

  setFeatureFlagService?(service: FeatureFlagService | undefined): void;
}

/**
 * Job lifecycle hooks interface
 * @template TPayload - Payload schema type
 * @template TResult - Result type
 * @template TMetadata - Metadata type
 */
export interface JobLifecycleHooks<
  TPayload extends z.ZodType,
  TResult,
  TMetadata = Record<string, unknown>,
> {
  /**
   * Hook called before job execution
   */
  beforeExecute?(payload: z.infer<TPayload>, context: JobContext<TMetadata>): Awaitable<void>;

  /**
   * Hook called after successful job execution
   */
  afterExecute?(result: TResult, context: JobContext<TMetadata>): Awaitable<void>;

  /**
   * Hook called on job execution error
   */
  onError?(error: Error, context: JobContext<TMetadata>): Awaitable<void>;

  /**
   * Hook called when job is retried
   */
  onRetry?(error: Error, attemptNumber: number, context: JobContext<TMetadata>): Awaitable<void>;

  /**
   * Hook called when job exhausts all retries
   */
  onMaxAttemptsReached?(error: Error, context: JobContext<TMetadata>): Awaitable<void>;

  /**
   * Hook called on job cancellation
   */
  onCancel?(context: JobContext<TMetadata>): Awaitable<void>;
}

/**
 * Infer payload type from job
 * @template T - Job type
 */
export type InferJobPayload<T> = T extends IJob<infer P, unknown, unknown> ? z.infer<P> : never;

/**
 * Infer result type from job
 * @template T - Job type
 */
export type InferJobResult<T> = T extends IJob<z.ZodType, infer R, unknown> ? R : never;

/**
 * Infer metadata type from job
 * @template T - Job type
 */
export type InferJobMetadata<T> = T extends IJob<z.ZodType, unknown, infer M> ? M : never;

/**
 * Infer job configuration from job
 * @template T - Job type
 */
export type InferJobConfig<_T extends IJob> = JobConfig;

/**
 * Job registry map type
 * @template TJobs - Record of job name to job instance
 */
export type JobRegistryMap<TJobs extends Record<string, IJob>> = {
  readonly [K in keyof TJobs]: TJobs[K];
};

/**
 * Type-safe job payload map from registry
 * @template TRegistry - Job registry map type
 */
export type JobPayloadMap<TRegistry extends Record<string, IJob>> = {
  [K in keyof TRegistry]: InferJobPayload<TRegistry[K]>;
};

/**
 * Type-safe job result map from registry
 * @template TRegistry - Job registry map type
 */
export type JobResultMap<TRegistry extends Record<string, IJob>> = {
  [K in keyof TRegistry]: InferJobResult<TRegistry[K]>;
};

/**
 * Job factory function type
 * @template T - Job type to create
 */
export type JobFactory<T extends IJob> = () => T;

/**
 * Job queue interface with generic job type
 * @template TJob - Job type
 */
export interface IJobQueue<TJob extends IJob> {
  /**
   * Enqueue a job for execution
   * @param payload - Job payload
   * @param config - Optional job configuration
   * @returns Job ID
   */
  enqueue(payload: InferJobPayload<TJob>, config?: Partial<JobConfig>): Promise<JobId>;

  /**
   * Enqueue multiple jobs in batch
   * @param payloads - Array of job payloads
   * @param config - Optional job configuration
   * @returns Array of job IDs
   */
  enqueueBatch(payloads: InferJobPayload<TJob>[], config?: Partial<JobConfig>): Promise<JobId[]>;

  /**
   * Schedule a job for future execution
   * @param payload - Job payload
   * @param runAt - Scheduled execution time
   * @param config - Optional job configuration
   * @returns Job ID
   */
  schedule(
    payload: InferJobPayload<TJob>,
    runAt: Date,
    config?: Partial<JobConfig>
  ): Promise<JobId>;

  /**
   * Cancel a pending job
   * @param jobId - Job ID to cancel
   * @returns Whether cancellation was successful
   */
  cancel(jobId: JobId): Promise<boolean>;

  /**
   * Get job statistics
   * @returns Queue statistics
   */
  getStats(): Promise<QueueStats>;
}

/**
 * Queue statistics interface
 */
export interface QueueStats {
  /** Total pending jobs */
  pending: number;
  /** Total running jobs */
  running: number;
  /** Total completed jobs */
  completed: number;
  /** Total failed jobs */
  failed: number;
  /** Average execution time */
  avgExecutionTime: number;
  /** Error rate percentage */
  errorRate: number;
}

/**
 * Job event types using template literal types
 * @template TJobName - Job name type
 */
export type JobEventType<TJobName extends string = string> =
  | `job.${TJobName}.started`
  | `job.${TJobName}.completed`
  | `job.${TJobName}.failed`
  | `job.${TJobName}.retrying`
  | `job.${TJobName}.cancelled`;

/**
 * Job event payload interface
 * @template TJobName - Job name
 * @template TPayload - Job payload type
 * @template TResult - Job result type
 */
export interface JobEvent<TJobName extends string, TPayload = unknown, TResult = unknown> {
  /** Event type */
  type: JobEventType<TJobName>;
  /** Job ID */
  jobId: JobId;
  /** Job name */
  jobName: TJobName;
  /** Job payload */
  payload: TPayload;
  /** Job result (for completed events) */
  result?: TResult;
  /** Error (for failed events) */
  error?: Error;
  /** Timestamp */
  timestamp: Date;
  /** Attempt number */
  attemptNumber: number;
  /** Correlation ID */
  correlationId: CorrelationId;
}

/**
 * Job constructor type with generics
 * @template TPayload - Payload schema type
 * @template TResult - Result type
 * @template TMetadata - Metadata type
 */
export type JobConstructor<
  TPayload extends z.ZodType = z.ZodType,
  TResult = void,
  TMetadata = Record<string, unknown>,
> = Constructor<IJob<TPayload, TResult, TMetadata>>;

/**
 * Prettified job type for better IDE display
 */
export type PrettyJob<T extends IJob> = Prettify<T>;

/**
 * Job execution options
 */
export interface JobExecutionOptions {
  /** Timeout in milliseconds */
  timeout?: number;
  /** Whether to capture memory metrics */
  captureMetrics?: boolean;
  /** Custom execution context */
  context?: Record<string, unknown>;
}

/**
 * Transaction isolation level for transactional jobs
 */
export type IsolationLevel =
  | 'READ UNCOMMITTED'
  | 'READ COMMITTED'
  | 'REPEATABLE READ'
  | 'SERIALIZABLE';

/**
 * Streaming job chunk interface
 * @template TData - Chunk data type
 */
export interface StreamChunk<TData = unknown> {
  /** Chunk data */
  data: TData;
  /** Chunk index */
  index: number;
  /** Whether this is the last chunk */
  isLast: boolean;
  /** Chunk metadata */
  metadata?: Record<string, unknown>;
}
