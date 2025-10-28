/**
 * @fileoverview Base job abstract class with extensive generics and lifecycle hooks
 * @module core/abstractions/BaseJob
 */

import type { Task, JobHelpers } from 'graphile-worker';
import { trace, type Span } from '@opentelemetry/api';
import type { Logger } from 'pino';
import { z, type ZodError } from 'zod';

import type {
  JobConfig,
  JobContext,
  JobLifecycleHooks,
  JobName,
  JobId,
  CorrelationId,
  IJob,
  JobError,
} from '../types';

/**
 * Abstract base class for all jobs with full generic type safety
 *
 * @template TPayload - Zod schema type for payload validation
 * @template TResult - Job execution result type
 * @template TMetadata - Additional context metadata type
 *
 * @example
 * ```typescript
 * const EmailPayloadSchema = z.object({
 *   to: z.string().email(),
 *   subject: z.string(),
 *   body: z.string(),
 * });
 *
 * class EmailJob extends BaseJob<typeof EmailPayloadSchema, void> {
 *   protected readonly schema = EmailPayloadSchema;
 *   protected readonly jobName = 'send-email' as JobName;
 *   protected readonly defaultConfig = { maxAttempts: 3, priority: 0 };
 *
 *   async execute(payload, context) {
 *     await this.sendEmail(payload);
 *   }
 * }
 * ```
 */
export abstract class BaseJob<
    TPayload extends z.ZodType,
    TResult = void,
    TMetadata = Record<string, unknown>
  >
  implements IJob<TPayload, TResult, TMetadata>, JobLifecycleHooks<TPayload, TResult, TMetadata>
{
  /**
   * Unique job name identifier
   * Must be overridden by subclasses
   */
  public abstract readonly jobName: JobName;

  /**
   * Zod schema for payload validation
   * Must be overridden by subclasses
   */
  public abstract readonly schema: TPayload;

  /**
   * Default job configuration
   * Can be overridden by subclasses
   */
  public abstract readonly defaultConfig: Partial<JobConfig>;

  /**
   * Tracer instance for this job
   */
  private readonly tracer = trace.getTracer('graphile-worker');

  /**
   * Main execution method - must be implemented by subclasses
   *
   * @param payload - Validated job payload
   * @param context - Job execution context
   * @returns Execution result
   */
  abstract execute(payload: z.infer<TPayload>, context: JobContext<TMetadata>): Promise<TResult>;

  /**
   * Validate job payload against schema
   *
   * @param payload - Raw payload to validate
   * @returns Validated and typed payload
   * @throws {ZodError} If validation fails
   */
  validate(payload: unknown): z.infer<TPayload> {
    try {
      return this.schema.parse(payload);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const formattedErrors = error.errors.map((err) => ({
          path: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));
        throw new Error(
          `Payload validation failed: ${JSON.stringify(formattedErrors, null, 2)}`
        );
      }
      throw error;
    }
  }

  /**
   * Pre-execution hook
   * Override to add custom behavior before job execution
   *
   * @param payload - Validated payload
   * @param context - Job context
   */
  async beforeExecute(
    payload: z.infer<TPayload>,
    context: JobContext<TMetadata>
  ): Promise<void> {
    context.logger.info(
      `Starting job: ${this.jobName}`,
      {
        jobName: this.jobName,
        jobId: context.jobId,
        attemptNumber: context.attemptNumber,
        payload,
      }
    );

    // Set span attributes
    context.span.setAttributes({
      'job.name': this.jobName,
      'job.id': context.jobId,
      'job.attempt': context.attemptNumber,
      'job.max_attempts': context.maxAttempts,
    });
  }

  /**
   * Post-execution hook
   * Override to add custom behavior after successful job execution
   *
   * @param result - Execution result
   * @param context - Job context
   */
  async afterExecute(
    result: TResult,
    context: JobContext<TMetadata>
  ): Promise<void> {
    context.logger.info(
      `Completed job: ${this.jobName}`,
      {
        jobName: this.jobName,
        jobId: context.jobId,
        result,
        duration: Date.now() - context.startedAt.getTime(),
      }
    );

    context.span.setAttributes({
      'job.status': 'completed',
    });
  }

  /**
   * Error handling hook
   * Override to add custom error handling logic
   *
   * @param error - Error that occurred
   * @param context - Job context
   */
  async onError(error: Error, context: JobContext<TMetadata>): Promise<void> {
    const jobError: JobError = Object.assign(error, {
      jobId: context.jobId,
      jobName: this.jobName,
      attemptNumber: context.attemptNumber,
      retryable: context.attemptNumber < context.maxAttempts,
      cause: error.cause instanceof Error ? error.cause : undefined,
      context: {
        correlationId: context.correlationId,
        metadata: context.metadata,
      },
    });

    context.logger.error(
      `Job failed: ${this.jobName}`,
      {
        error: jobError,
        jobName: this.jobName,
        jobId: context.jobId,
        attemptNumber: context.attemptNumber,
        maxAttempts: context.maxAttempts,
        stack: error.stack,
      }
    );

    context.span.recordException(error);
    context.span.setAttributes({
      'job.status': 'failed',
      'job.error.message': error.message,
      'job.error.retryable': jobError.retryable,
    });
  }

  /**
   * Retry hook
   * Called when a job is being retried after a failure
   *
   * @param error - Error that caused the retry
   * @param attemptNumber - Current attempt number
   * @param context - Job context
   */
  async onRetry(
    error: Error,
    attemptNumber: number,
    context: JobContext<TMetadata>
  ): Promise<void> {
    context.logger.warn(
      `Retrying job: ${this.jobName}`,
      {
        jobName: this.jobName,
        jobId: context.jobId,
        attemptNumber,
        maxAttempts: context.maxAttempts,
        error: error.message,
      }
    );
  }

  /**
   * Max attempts reached hook
   * Called when a job has exhausted all retry attempts
   *
   * @param error - Final error
   * @param context - Job context
   */
  async onMaxAttemptsReached(
    error: Error,
    context: JobContext<TMetadata>
  ): Promise<void> {
    context.logger.error(
      `Job max attempts reached: ${this.jobName}`,
      {
        jobName: this.jobName,
        jobId: context.jobId,
        error: error.message,
        stack: error.stack,
      }
    );
  }

  /**
   * Cancellation hook
   * Called when a job is cancelled
   *
   * @param context - Job context
   */
  async onCancel(context: JobContext<TMetadata>): Promise<void> {
    context.logger.warn(
      `Job cancelled: ${this.jobName}`,
      {
        jobName: this.jobName,
        jobId: context.jobId,
      }
    );
  }

  /**
   * Create job context from Graphile Worker helpers
   *
   * @param helpers - Graphile Worker helpers
   * @param span - OpenTelemetry span
   * @param metadata - Additional metadata
   * @returns Job context
   */
  protected createContext(
    helpers: JobHelpers,
    span: Span,
    metadata: TMetadata = {} as TMetadata
  ): JobContext<TMetadata> {
    return {
      logger: helpers.logger,
      correlationId: helpers.job.id as CorrelationId,
      span,
      attemptNumber: helpers.job.attempts,
      maxAttempts: helpers.job.max_attempts,
      jobId: helpers.job.id as JobId,
      jobName: this.jobName,
      createdAt: new Date(helpers.job.created_at),
      startedAt: new Date(),
      metadata,
      helpers,
    };
  }

  /**
   * Get Graphile Worker task function
   * This is the function that gets registered with Graphile Worker
   *
   * @returns Task function
   */
  getTaskFunction(): Task {
    return async (payload: unknown, helpers: JobHelpers): Promise<void | unknown[]> => {
      const spanName = `job.${this.jobName}`;
      const span = this.tracer.startSpan(spanName);

      let context: JobContext<TMetadata> | null = null;

      try {
        // Create context
        context = this.createContext(helpers, span);

        // Validate payload
        const validatedPayload = this.validate(payload);

        // Execute lifecycle hooks
        await this.beforeExecute(validatedPayload, context);

        const startTime = Date.now();
        const result = await this.execute(validatedPayload, context);
        const duration = Date.now() - startTime;

        await this.afterExecute(result, context);

        // Set success status
        span.setStatus({ code: 1 }); // SpanStatusCode.OK
        span.setAttributes({
          'job.duration_ms': duration,
        });

        return undefined;
      } catch (error) {
        const err = error as Error;

        if (context) {
          await this.onError(err, context);

          // Check if retry will occur
          if (context.attemptNumber < context.maxAttempts) {
            await this.onRetry(err, context.attemptNumber + 1, context);
          } else {
            await this.onMaxAttemptsReached(err, context);
          }
        }

        // Set error status
        span.setStatus({
          code: 2, // SpanStatusCode.ERROR
          message: err.message,
        });

        throw err;
      } finally {
        span.end();
      }
    };
  }

  /**
   * Get job configuration with optional overrides
   *
   * @param overrides - Configuration overrides
   * @returns Complete job configuration
   */
  getConfig(overrides?: Partial<JobConfig>): JobConfig {
    return {
      ...this.defaultConfig,
      ...overrides,
    } as JobConfig;
  }

  /**
   * Get job name (accessor for external use)
   */
  get name(): JobName {
    return this.jobName;
  }

  /**
   * Get job schema (accessor for external use)
   */
  get payloadSchema(): TPayload {
    return this.schema;
  }
}
