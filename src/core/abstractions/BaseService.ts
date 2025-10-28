/**
 * @fileoverview Generic base service class for business logic layer with dependency injection
 * @module core/abstractions/BaseService
 */

import type { Logger } from 'pino';
import { trace, type Span } from '@opentelemetry/api';

import type { Result, AsyncFunction } from '../types';

/**
 * Service dependencies interface
 * Services can declare their dependencies using this type
 */
export interface ServiceDependencies {
  logger: Logger;
  [key: string]: unknown;
}

/**
 * Service context for operations
 */
export interface ServiceContext {
  /** Request logger */
  logger: Logger;
  /** Request/correlation ID */
  requestId: string;
  /** User ID (if authenticated) */
  userId?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Service error with context
 */
export class ServiceError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ServiceError';
    Object.setPrototypeOf(this, ServiceError.prototype);
  }

  /**
   * Create a validation error
   */
  static validation(message: string, context?: Record<string, unknown>): ServiceError {
    return new ServiceError(message, 'VALIDATION_ERROR', 400, context);
  }

  /**
   * Create a not found error
   */
  static notFound(resource: string, id: string): ServiceError {
    return new ServiceError(
      `${resource} not found`,
      'NOT_FOUND',
      404,
      { resource, id }
    );
  }

  /**
   * Create an unauthorized error
   */
  static unauthorized(message: string = 'Unauthorized'): ServiceError {
    return new ServiceError(message, 'UNAUTHORIZED', 401);
  }

  /**
   * Create a forbidden error
   */
  static forbidden(message: string = 'Forbidden'): ServiceError {
    return new ServiceError(message, 'FORBIDDEN', 403);
  }

  /**
   * Create a conflict error
   */
  static conflict(message: string, context?: Record<string, unknown>): ServiceError {
    return new ServiceError(message, 'CONFLICT', 409, context);
  }

  /**
   * Create an internal error
   */
  static internal(message: string, cause?: Error): ServiceError {
    const error = new ServiceError(message, 'INTERNAL_ERROR', 500, {
      cause: cause?.message,
    });
    error.cause = cause;
    return error;
  }
}

/**
 * Abstract base service class with dependency injection
 *
 * @template TDependencies - Service dependencies type
 *
 * @example
 * ```typescript
 * interface UserServiceDependencies extends ServiceDependencies {
 *   userRepository: UserRepository;
 *   emailService: EmailService;
 * }
 *
 * class UserService extends BaseService<UserServiceDependencies> {
 *   constructor(dependencies: UserServiceDependencies) {
 *     super(dependencies, 'UserService');
 *   }
 *
 *   async createUser(data: CreateUserDTO, context: ServiceContext): Promise<User> {
 *     return this.executeWithTracing('createUser', async (span) => {
 *       const user = await this.dependencies.userRepository.create(data);
 *       await this.dependencies.emailService.sendWelcomeEmail(user.email);
 *       return user;
 *     });
 *   }
 * }
 * ```
 */
export abstract class BaseService<TDependencies extends ServiceDependencies = ServiceDependencies> {
  /**
   * Service logger (from dependencies)
   */
  protected readonly logger: Logger;

  /**
   * Tracer instance for this service
   */
  private readonly tracer = trace.getTracer('service');

  /**
   * Constructor
   *
   * @param dependencies - Service dependencies
   * @param serviceName - Name of the service (for logging/tracing)
   */
  constructor(
    protected readonly dependencies: TDependencies,
    protected readonly serviceName: string
  ) {
    this.logger = dependencies.logger.child({ service: serviceName });
  }

  /**
   * Execute operation with distributed tracing
   *
   * @template TResult - Operation result type
   * @param operationName - Name of the operation
   * @param operation - Operation to execute
   * @param attributes - Additional span attributes
   * @returns Operation result
   */
  protected async executeWithTracing<TResult>(
    operationName: string,
    operation: (span: Span) => Promise<TResult>,
    attributes?: Record<string, string | number | boolean>
  ): Promise<TResult> {
    const spanName = `service.${this.serviceName}.${operationName}`;
    const span = this.tracer.startSpan(spanName);

    if (attributes) {
      span.setAttributes(attributes);
    }

    span.setAttributes({
      'service.name': this.serviceName,
      'operation.name': operationName,
    });

    try {
      const startTime = Date.now();
      const result = await operation(span);
      const duration = Date.now() - startTime;

      span.setAttributes({
        'operation.duration_ms': duration,
      });

      span.setStatus({ code: 1 }); // SpanStatusCode.OK
      return result;
    } catch (error) {
      const err = error as Error;

      span.recordException(err);
      span.setStatus({
        code: 2, // SpanStatusCode.ERROR
        message: err.message,
      });

      this.logger.error(
        {
          service: this.serviceName,
          operation: operationName,
          error: err.message,
          stack: err.stack,
        },
        `Operation failed: ${operationName}`
      );

      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Execute operation with error handling and Result type
   *
   * @template TData - Success data type
   * @template TError - Error type
   * @param operation - Operation to execute
   * @returns Result object
   */
  protected async executeWithResult<TData, TError = ServiceError>(
    operation: AsyncFunction<[], TData>
  ): Promise<Result<TData, TError>> {
    try {
      const data = await operation();
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error as TError };
    }
  }

  /**
   * Validate input data
   *
   * @param condition - Validation condition
   * @param message - Error message if validation fails
   * @param context - Additional error context
   * @throws {ServiceError} If validation fails
   */
  protected validate(
    condition: boolean,
    message: string,
    context?: Record<string, unknown>
  ): asserts condition {
    if (!condition) {
      throw ServiceError.validation(message, context);
    }
  }

  /**
   * Assert entity exists
   *
   * @template T - Entity type
   * @param entity - Entity to check
   * @param resourceName - Resource name for error message
   * @param id - Resource ID for error message
   * @returns Entity (non-null)
   * @throws {ServiceError} If entity is null/undefined
   */
  protected assertExists<T>(
    entity: T | null | undefined,
    resourceName: string,
    id: string
  ): asserts entity is T {
    if (entity === null || entity === undefined) {
      throw ServiceError.notFound(resourceName, id);
    }
  }

  /**
   * Log operation start
   *
   * @param operation - Operation name
   * @param context - Operation context
   */
  protected logOperationStart(operation: string, context?: Record<string, unknown>): void {
    this.logger.info(
      {
        service: this.serviceName,
        operation,
        ...context,
      },
      `Starting operation: ${operation}`
    );
  }

  /**
   * Log operation completion
   *
   * @param operation - Operation name
   * @param duration - Operation duration in milliseconds
   * @param context - Operation context
   */
  protected logOperationComplete(
    operation: string,
    duration: number,
    context?: Record<string, unknown>
  ): void {
    this.logger.info(
      {
        service: this.serviceName,
        operation,
        duration,
        ...context,
      },
      `Completed operation: ${operation}`
    );
  }

  /**
   * Log operation error
   *
   * @param operation - Operation name
   * @param error - Error that occurred
   * @param context - Operation context
   */
  protected logOperationError(
    operation: string,
    error: Error,
    context?: Record<string, unknown>
  ): void {
    this.logger.error(
      {
        service: this.serviceName,
        operation,
        error: error.message,
        stack: error.stack,
        ...context,
      },
      `Operation failed: ${operation}`
    );
  }

  /**
   * Measure operation execution time
   *
   * @template TResult - Operation result type
   * @param operation - Operation to measure
   * @returns Tuple of [result, duration in milliseconds]
   */
  protected async measureTime<TResult>(
    operation: AsyncFunction<[], TResult>
  ): Promise<[TResult, number]> {
    const startTime = Date.now();
    const result = await operation();
    const duration = Date.now() - startTime;
    return [result, duration];
  }

  /**
   * Retry operation with exponential backoff
   *
   * @template TResult - Operation result type
   * @param operation - Operation to retry
   * @param maxAttempts - Maximum retry attempts
   * @param baseDelay - Base delay in milliseconds
   * @param maxDelay - Maximum delay in milliseconds
   * @returns Operation result
   */
  protected async retryWithBackoff<TResult>(
    operation: AsyncFunction<[], TResult>,
    maxAttempts: number = 3,
    baseDelay: number = 1000,
    maxDelay: number = 30000
  ): Promise<TResult> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (attempt === maxAttempts) {
          break;
        }

        const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);

        this.logger.warn(
          {
            service: this.serviceName,
            attempt,
            maxAttempts,
            delay,
            error: lastError.message,
          },
          'Operation failed, retrying...'
        );

        await this.sleep(delay);
      }
    }

    throw lastError ?? new Error('Operation failed after retries');
  }

  /**
   * Sleep for specified duration
   *
   * @param ms - Milliseconds to sleep
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Batch process items with concurrency control
   *
   * @template TItem - Item type
   * @template TResult - Result type
   * @param items - Items to process
   * @param processor - Processing function
   * @param concurrency - Maximum concurrent operations
   * @returns Processing results
   */
  protected async batchProcess<TItem, TResult>(
    items: TItem[],
    processor: (item: TItem) => Promise<TResult>,
    concurrency: number = 5
  ): Promise<TResult[]> {
    const results: TResult[] = [];
    const executing: Promise<void>[] = [];

    for (const item of items) {
      const promise = processor(item).then((result) => {
        results.push(result);
      });

      executing.push(promise);

      if (executing.length >= concurrency) {
        await Promise.race(executing);
        executing.splice(
          executing.findIndex((p) => p === promise),
          1
        );
      }
    }

    await Promise.all(executing);
    return results;
  }

  /**
   * Create scoped logger with additional context
   *
   * @param context - Additional context
   * @returns Scoped logger
   */
  protected createScopedLogger(context: Record<string, unknown>): Logger {
    return this.logger.child(context);
  }

  /**
   * Get service name
   */
  getName(): string {
    return this.serviceName;
  }

  /**
   * Get service dependencies
   */
  protected getDependencies(): TDependencies {
    return this.dependencies;
  }
}
