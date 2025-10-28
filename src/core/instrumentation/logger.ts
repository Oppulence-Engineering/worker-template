/**
 * @fileoverview Structured logging with Pino and correlation ID support
 * @module core/instrumentation/logger
 */

/* eslint-disable import/no-named-as-default, import/no-named-as-default-member */

import { randomUUID } from 'crypto';

import pino, { type Logger } from 'pino';

import type { LoggingConfig } from '../config/schema';
import type { CorrelationId } from '../types';

/**
 * Create base logger instance
 *
 * @param config - Logging configuration
 * @returns Pino logger instance
 */
export function createLogger(config: LoggingConfig, serviceName: string): Logger {
  const pinoConfig: pino.LoggerOptions = {
    level: config.level,
    formatters: {
      level: (label) => ({ level: label }),
      bindings: (bindings) => ({
        pid: bindings.pid as number,
        hostname: bindings.hostname as string,
      }),
    },
    serializers: {
      err: pino.stdSerializers.err,
      error: pino.stdSerializers.err,
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    base: {
      service: serviceName,
    },
  };

  // Add pretty printing in development
  if (config.pretty) {
    return pino(
      pinoConfig,
      pino.transport({
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
          singleLine: false,
          messageFormat: '[{service}] {msg}',
        },
      }) as pino.DestinationStream
    );
  }

  return pino(pinoConfig);
}

/**
 * Create child logger with correlation ID
 *
 * @param logger - Parent logger
 * @param correlationId - Correlation ID for request tracking
 * @returns Child logger with correlation ID
 */
export function withCorrelationId(logger: Logger, correlationId?: CorrelationId): Logger {
  const id = correlationId ?? (randomUUID() as CorrelationId);
  return logger.child({ correlationId: id });
}

/**
 * Create child logger with additional context
 *
 * @param logger - Parent logger
 * @param context - Additional context
 * @returns Child logger with context
 */
export function withContext(logger: Logger, context: Record<string, unknown>): Logger {
  return logger.child(context);
}

/**
 * Log operation timing
 *
 * @param logger - Logger instance
 * @param operation - Operation name
 * @param duration - Duration in milliseconds
 * @param context - Additional context
 */
export function logTiming(
  logger: Logger,
  operation: string,
  duration: number,
  context?: Record<string, unknown>
): void {
  logger.info(
    {
      operation,
      duration,
      ...context,
    },
    `Operation completed in ${duration}ms`
  );
}

/**
 * Log error with stack trace
 *
 * @param logger - Logger instance
 * @param error - Error to log
 * @param context - Additional context
 */
export function logError(logger: Logger, error: Error, context?: Record<string, unknown>): void {
  logger.error(
    {
      error: {
        message: error.message,
        name: error.name,
        stack: error.stack,
      },
      ...context,
    },
    error.message
  );
}

/**
 * Create request logger with request ID
 *
 * @param logger - Base logger
 * @param requestId - Request ID
 * @returns Request logger
 */
export function createRequestLogger(logger: Logger, requestId: string): Logger {
  return logger.child({ requestId });
}
