/**
 * @fileoverview Generic base middleware class for composable middleware patterns
 * @module core/abstractions/BaseMiddleware
 *
 * Note: Lifecycle hooks are intentionally async to allow subclasses to use await.
 */

/* eslint-disable @typescript-eslint/require-await */

import { trace, type Span } from '@opentelemetry/api';

import type { AsyncFunction } from '../types';
import type { Logger } from 'pino';

/**
 * Middleware context interface
 * @template TContext - Context type that flows through middleware
 */
export interface MiddlewareContext<TContext = Record<string, unknown>> {
  /** Base context */
  context: TContext;
  /** Request logger */
  logger: Logger;
  /** Request ID */
  requestId: string;
  /** Start timestamp */
  startTime: number;
  /** Additional metadata */
  metadata: Record<string, unknown>;
}

/**
 * Next function type for middleware chain
 * @template TResult - Result type of next middleware
 */
export type NextFunction<TResult = unknown> = () => Promise<TResult>;

/**
 * Middleware function type
 * @template TContext - Context type
 * @template TResult - Result type
 */
export type MiddlewareFunction<TContext = unknown, TResult = unknown> = (
  context: MiddlewareContext<TContext>,
  next: NextFunction<TResult>
) => Promise<TResult>;

/**
 * Middleware interface with execute method
 * @template TContext - Context type
 * @template TResult - Result type
 */
export interface IMiddleware<TContext = unknown, TResult = unknown> {
  /**
   * Execute middleware
   * @param context - Middleware context
   * @param next - Next middleware function
   * @returns Execution result
   */
  execute(context: MiddlewareContext<TContext>, next: NextFunction<TResult>): Promise<TResult>;

  /**
   * Get middleware name
   */
  getName(): string;
}

/**
 * Abstract base middleware class
 *
 * @template TContext - Context type
 * @template TResult - Result type
 *
 * @example
 * ```typescript
 * class AuthMiddleware extends BaseMiddleware<GraphQLContext, void> {
 *   protected middlewareName = 'auth';
 *
 *   async execute(context, next) {
 *     if (!context.context.user) {
 *       throw new Error('Unauthorized');
 *     }
 *     return next();
 *   }
 * }
 * ```
 */
export abstract class BaseMiddleware<TContext = unknown, TResult = unknown>
  implements IMiddleware<TContext, TResult>
{
  /**
   * Middleware name for logging/tracing
   * Must be overridden by subclasses
   */
  protected abstract readonly middlewareName: string;

  /**
   * Tracer instance
   */
  private readonly tracer = trace.getTracer('middleware');

  /**
   * Execute middleware with tracing
   *
   * @param context - Middleware context
   * @param next - Next middleware function
   * @returns Execution result
   */
  async execute(
    context: MiddlewareContext<TContext>,
    next: NextFunction<TResult>
  ): Promise<TResult> {
    const spanName = `middleware.${this.middlewareName}`;
    const span = this.tracer.startSpan(spanName);

    try {
      span.setAttributes({
        'middleware.name': this.middlewareName,
        'request.id': context.requestId,
      });

      // Before hook
      await this.before(context, span);

      // Execute main middleware logic
      const result = await this.handle(context, next, span);

      // After hook
      await this.after(context, result, span);

      span.setStatus({ code: 1 }); // OK
      return result;
    } catch (error) {
      const err = error as Error;

      span.recordException(err);
      span.setStatus({ code: 2, message: err.message }); // ERROR

      // Error hook
      await this.onError(context, err, span);

      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Main middleware handler - must be implemented by subclasses
   *
   * @param context - Middleware context
   * @param next - Next middleware function
   * @param span - OpenTelemetry span
   * @returns Execution result
   */
  protected abstract handle(
    context: MiddlewareContext<TContext>,
    next: NextFunction<TResult>,
    span: Span
  ): Promise<TResult>;

  /**
   * Before hook - executed before main handler
   *
   * @param context - Middleware context
   * @param span - OpenTelemetry span
   */
  protected async before(context: MiddlewareContext<TContext>, _span: Span): Promise<void> {
    context.logger.debug(
      { middleware: this.middlewareName },
      `Executing middleware: ${this.middlewareName}`
    );
  }

  /**
   * After hook - executed after successful main handler
   *
   * @param context - Middleware context
   * @param result - Execution result
   * @param span - OpenTelemetry span
   */
  protected async after(
    context: MiddlewareContext<TContext>,
    _result: TResult,
    _span: Span
  ): Promise<void> {
    context.logger.debug(
      { middleware: this.middlewareName },
      `Completed middleware: ${this.middlewareName}`
    );
  }

  /**
   * Error hook - executed on error
   *
   * @param context - Middleware context
   * @param error - Error that occurred
   * @param span - OpenTelemetry span
   */
  protected async onError(
    context: MiddlewareContext<TContext>,
    error: Error,
    _span: Span
  ): Promise<void> {
    context.logger.error(
      {
        middleware: this.middlewareName,
        error: error.message,
        stack: error.stack,
      },
      `Middleware error: ${this.middlewareName}`
    );
  }

  /**
   * Get middleware name
   */
  getName(): string {
    return this.middlewareName;
  }
}

/**
 * Middleware pipeline/chain for composing multiple middleware
 *
 * @template TContext - Context type
 * @template TResult - Result type
 */
export class MiddlewarePipeline<TContext = unknown, TResult = unknown> {
  /**
   * Registered middleware in order of execution
   */
  private middleware: IMiddleware<TContext, TResult>[] = [];

  /**
   * Logger instance
   */
  private logger?: Logger;

  /**
   * Set logger for pipeline
   */
  setLogger(logger: Logger): this {
    this.logger = logger;
    return this;
  }

  /**
   * Add middleware to the pipeline
   *
   * @param middleware - Middleware to add
   * @returns This pipeline for chaining
   */
  use(middleware: IMiddleware<TContext, TResult>): this {
    this.middleware.push(middleware);
    return this;
  }

  /**
   * Add multiple middleware to the pipeline
   *
   * @param middleware - Middleware array to add
   * @returns This pipeline for chaining
   */
  useMany(middleware: IMiddleware<TContext, TResult>[]): this {
    this.middleware.push(...middleware);
    return this;
  }

  /**
   * Execute the middleware pipeline
   *
   * @param context - Initial context
   * @param finalHandler - Final handler to execute after all middleware
   * @returns Execution result
   */
  async execute(
    context: TContext,
    finalHandler: AsyncFunction<[TContext], TResult>
  ): Promise<TResult> {
    const middlewareContext: MiddlewareContext<TContext> = {
      context,
      logger: this.logger ?? (console as unknown as Logger),
      requestId: crypto.randomUUID(),
      startTime: Date.now(),
      metadata: {},
    };

    // Build middleware chain
    const chain = this.buildChain(middlewareContext, finalHandler);

    // Execute chain
    return chain();
  }

  /**
   * Build the middleware execution chain
   *
   * @param context - Middleware context
   * @param finalHandler - Final handler
   * @returns Chain start function
   */
  private buildChain(
    context: MiddlewareContext<TContext>,
    finalHandler: AsyncFunction<[TContext], TResult>
  ): NextFunction<TResult> {
    let index = 0;

    const dispatch = async (): Promise<TResult> => {
      // All middleware executed, call final handler
      if (index >= this.middleware.length) {
        return finalHandler(context.context);
      }

      // Get current middleware
      const currentMiddleware = this.middleware[index];
      if (!currentMiddleware) {
        throw new Error('Middleware not found');
      }

      index++;

      // Execute current middleware with next function
      return currentMiddleware.execute(context, dispatch);
    };

    return dispatch;
  }

  /**
   * Get all registered middleware
   */
  getMiddleware(): IMiddleware<TContext, TResult>[] {
    return [...this.middleware];
  }

  /**
   * Get middleware count
   */
  getCount(): number {
    return this.middleware.length;
  }

  /**
   * Clear all middleware
   */
  clear(): this {
    this.middleware = [];
    return this;
  }

  /**
   * Remove specific middleware by name
   *
   * @param name - Middleware name to remove
   * @returns Whether middleware was removed
   */
  remove(name: string): boolean {
    const initialLength = this.middleware.length;
    this.middleware = this.middleware.filter((m) => m.getName() !== name);
    return this.middleware.length < initialLength;
  }
}

/**
 * Compose multiple middleware functions into one
 *
 * @template TContext - Context type
 * @template TResult - Result type
 * @param middleware - Middleware array to compose
 * @returns Composed middleware function
 */
export function compose<TContext = unknown, TResult = unknown>(
  middleware: MiddlewareFunction<TContext, TResult>[]
): MiddlewareFunction<TContext, TResult> {
  return async (
    context: MiddlewareContext<TContext>,
    next: NextFunction<TResult>
  ): Promise<TResult> => {
    let index = -1;

    const dispatch = async (i: number): Promise<TResult> => {
      if (i <= index) {
        throw new Error('next() called multiple times');
      }

      index = i;

      const fn = middleware[i];
      if (!fn) {
        return next();
      }

      return fn(context, () => dispatch(i + 1));
    };

    return dispatch(0);
  };
}
