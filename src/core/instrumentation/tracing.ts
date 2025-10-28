/**
 * @fileoverview OpenTelemetry distributed tracing setup
 * @module core/instrumentation/tracing
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { Resource } from '@opentelemetry/resources';
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION, SEMRESATTRS_DEPLOYMENT_ENVIRONMENT } from '@opentelemetry/semantic-conventions';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import type { Span, Tracer } from '@opentelemetry/api';
import { trace } from '@opentelemetry/api';

import type { ObservabilityConfig } from '../config/schema';

/**
 * Setup OpenTelemetry tracing
 *
 * @param config - Observability configuration
 * @returns NodeSDK instance
 */
export function setupTracing(config: ObservabilityConfig): NodeSDK | null {
  if (!config.tracing.enabled) {
    return null;
  }

  // Create resource with service information
  const resource = new Resource({
    [SEMRESATTRS_SERVICE_NAME]: config.serviceName,
    [SEMRESATTRS_SERVICE_VERSION]: config.serviceVersion,
    [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: config.environment,
  });

  // Configure trace exporter
  const traceExporter = config.tracing.otlpEndpoint
    ? new OTLPTraceExporter({
        url: config.tracing.otlpEndpoint,
      })
    : new ConsoleSpanExporter();

  // Create and configure SDK
  const sdk = new NodeSDK({
    resource,
    traceExporter,
    instrumentations: [
      // Auto-instrumentations for common libraries
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': {
          enabled: false, // Disable fs instrumentation to reduce noise
        },
      }),
      // Specific instrumentations
      new HttpInstrumentation({
        ignoreIncomingRequestHook: (req) => {
          // Ignore health check requests
          return req.url?.includes('/health') ?? false;
        },
      }),
      new PgInstrumentation({
        enhancedDatabaseReporting: true,
      }),
    ],
    // Configure sampling based on sample rate
    // Note: For production, use ParentBasedSampler with AlwaysOnSampler
  });

  return sdk;
}

/**
 * Get tracer instance for a component
 *
 * @param name - Component name
 * @param version - Component version
 * @returns Tracer instance
 */
export function getTracer(name: string, version: string = '1.0.0'): Tracer {
  return trace.getTracer(name, version);
}

/**
 * Create and start a span
 *
 * @param tracer - Tracer instance
 * @param name - Span name
 * @param attributes - Span attributes
 * @returns Span instance
 */
export function createSpan(
  tracer: Tracer,
  name: string,
  attributes?: Record<string, string | number | boolean>
): Span {
  const span = tracer.startSpan(name);

  if (attributes) {
    span.setAttributes(attributes);
  }

  return span;
}

/**
 * Execute function with tracing
 *
 * @template T - Return type
 * @param tracer - Tracer instance
 * @param spanName - Span name
 * @param fn - Function to execute
 * @param attributes - Optional span attributes
 * @returns Function result
 */
export async function withTracing<T>(
  tracer: Tracer,
  spanName: string,
  fn: (span: Span) => Promise<T>,
  attributes?: Record<string, string | number | boolean>
): Promise<T> {
  const span = createSpan(tracer, spanName, attributes);

  try {
    const result = await fn(span);
    span.setStatus({ code: 1 }); // SpanStatusCode.OK
    return result;
  } catch (error) {
    const err = error as Error;
    span.recordException(err);
    span.setStatus({ code: 2, message: err.message }); // SpanStatusCode.ERROR
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Add event to current span
 *
 * @param span - Span instance
 * @param name - Event name
 * @param attributes - Event attributes
 */
export function addSpanEvent(
  span: Span,
  name: string,
  attributes?: Record<string, string | number | boolean>
): void {
  span.addEvent(name, attributes);
}

/**
 * Set span attributes
 *
 * @param span - Span instance
 * @param attributes - Attributes to set
 */
export function setSpanAttributes(
  span: Span,
  attributes: Record<string, string | number | boolean>
): void {
  span.setAttributes(attributes);
}

/**
 * Record exception on span
 *
 * @param span - Span instance
 * @param error - Error to record
 */
export function recordSpanException(span: Span, error: Error): void {
  span.recordException(error);
  span.setStatus({ code: 2, message: error.message }); // SpanStatusCode.ERROR
}
