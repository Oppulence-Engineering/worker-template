/**
 * @fileoverview Retryable job with configurable backoff strategies
 * @module jobs/base/RetryableJob
 */

import type { z } from 'zod';

import { BaseJob } from '../../core/abstractions/BaseJob';
import type {
  JobContext,
  RetryStrategy,
  ExponentialBackoffConfig,
  LinearBackoffConfig,
} from '../../core/types';

/**
 * Exponential backoff retry strategy
 */
export class ExponentialBackoffStrategy implements RetryStrategy<ExponentialBackoffConfig> {
  readonly name = 'exponential';

  calculateDelay(attemptNumber: number, config: ExponentialBackoffConfig): number {
    const { baseDelay, maxDelay, factor, jitter } = config;
    let delay = Math.min(baseDelay * Math.pow(factor, attemptNumber - 1), maxDelay);

    if (jitter) {
      // Add random jitter (±25%)
      const jitterAmount = delay * 0.25;
      delay = delay + (Math.random() * 2 - 1) * jitterAmount;
    }

    return Math.max(0, Math.floor(delay));
  }

  shouldRetry(attemptNumber: number, maxAttempts: number, error: Error): boolean {
    return attemptNumber < maxAttempts;
  }
}

/**
 * Linear backoff retry strategy
 */
export class LinearBackoffStrategy implements RetryStrategy<LinearBackoffConfig> {
  readonly name = 'linear';

  calculateDelay(attemptNumber: number, config: LinearBackoffConfig): number {
    const { baseDelay, maxDelay } = config;
    const delay = Math.min(baseDelay * attemptNumber, maxDelay);
    return Math.max(0, Math.floor(delay));
  }

  shouldRetry(attemptNumber: number, maxAttempts: number, error: Error): boolean {
    return attemptNumber < maxAttempts;
  }
}

/**
 * Constant delay retry strategy
 */
export class ConstantBackoffStrategy implements RetryStrategy<{ delay: number }> {
  readonly name = 'constant';

  calculateDelay(attemptNumber: number, config: { delay: number }): number {
    return config.delay;
  }

  shouldRetry(attemptNumber: number, maxAttempts: number, error: Error): boolean {
    return attemptNumber < maxAttempts;
  }
}

/**
 * Abstract retryable job with configurable backoff strategy
 *
 * @template TPayload - Payload schema type
 * @template TResult - Result type
 * @template TStrategy - Retry strategy config type
 * @template TMetadata - Metadata type
 *
 * @example
 * ```typescript
 * class EmailJob extends RetryableJob<
 *   typeof EmailSchema,
 *   void,
 *   ExponentialBackoffConfig
 * > {
 *   protected readonly schema = EmailSchema;
 *   protected readonly jobName = 'send-email' as JobName;
 *   protected readonly defaultConfig = { maxAttempts: 5 };
 *   protected readonly retryStrategy = new ExponentialBackoffStrategy();
 *   protected readonly strategyConfig = {
 *     baseDelay: 1000,
 *     maxDelay: 60000,
 *     factor: 2,
 *     jitter: true,
 *   };
 *
 *   async execute(payload, context) {
 *     await this.sendEmail(payload);
 *   }
 * }
 * ```
 */
export abstract class RetryableJob<
  TPayload extends z.ZodType,
  TResult = void,
  TStrategy = ExponentialBackoffConfig,
  TMetadata = Record<string, unknown>,
> extends BaseJob<TPayload, TResult, TMetadata> {
  /**
   * Retry strategy to use
   * Must be overridden by subclasses
   */
  protected abstract readonly retryStrategy: RetryStrategy<TStrategy>;

  /**
   * Strategy configuration
   * Must be overridden by subclasses
   */
  protected abstract readonly strategyConfig: TStrategy;

  /**
   * Override onError to implement retry logic with backoff
   */
  override async onError(error: Error, context: JobContext<TMetadata>): Promise<void> {
    await super.onError(error, context);

    // Check if retry should occur
    if (this.retryStrategy.shouldRetry(context.attemptNumber, context.maxAttempts, error)) {
      const delay = this.retryStrategy.calculateDelay(context.attemptNumber, this.strategyConfig);

      context.logger.info('Job will be retried with backoff', {
        attemptNumber: context.attemptNumber,
        maxAttempts: context.maxAttempts,
        delay,
        strategy: this.retryStrategy.name,
      });

      context.span.setAttributes({
        'job.retry.delay_ms': delay,
        'job.retry.strategy': this.retryStrategy.name,
      });
    }
  }

  /**
   * Determine if error is retryable
   * Override to implement custom retry logic based on error type
   *
   * @param error - Error that occurred
   * @returns Whether error is retryable
   */
  protected isRetryableError(error: Error): boolean {
    // By default, all errors are retryable
    // Override this method to implement custom logic
    // For example, don't retry validation errors
    return true;
  }

  /**
   * Get next retry delay
   *
   * @param attemptNumber - Current attempt number
   * @returns Delay in milliseconds
   */
  protected getRetryDelay(attemptNumber: number): number {
    return this.retryStrategy.calculateDelay(attemptNumber, this.strategyConfig);
  }
}

/**
 * Convenience class for exponential backoff jobs
 */
export abstract class ExponentialRetryJob<
  TPayload extends z.ZodType,
  TResult = void,
  TMetadata = Record<string, unknown>,
> extends RetryableJob<TPayload, TResult, ExponentialBackoffConfig, TMetadata> {
  protected readonly retryStrategy = new ExponentialBackoffStrategy();
  protected readonly strategyConfig: ExponentialBackoffConfig = {
    baseDelay: 1000,
    maxDelay: 60000,
    factor: 2,
    jitter: true,
  };
}

/**
 * Convenience class for linear backoff jobs
 */
export abstract class LinearRetryJob<
  TPayload extends z.ZodType,
  TResult = void,
  TMetadata = Record<string, unknown>,
> extends RetryableJob<TPayload, TResult, LinearBackoffConfig, TMetadata> {
  protected readonly retryStrategy = new LinearBackoffStrategy();
  protected readonly strategyConfig: LinearBackoffConfig = {
    baseDelay: 1000,
    maxDelay: 30000,
  };
}
