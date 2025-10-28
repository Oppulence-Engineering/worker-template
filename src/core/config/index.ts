/**
 * @fileoverview Configuration loader with environment variable support
 * @module core/config
 */

import { config as loadEnv } from 'dotenv';

import { AppConfigSchema, buildDatabaseUrl, type AppConfig } from './schema';

// Load environment variables
loadEnv();

/**
 * Parse boolean from environment variable
 */
function parseBoolean(value: string | undefined, defaultValue: boolean = false): boolean {
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Parse number from environment variable
 */
function parseNumber(value: string | undefined, defaultValue: number): number {
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse float from environment variable
 */
function parseFloatValue(value: string | undefined, defaultValue: number): number {
  if (value === undefined) return defaultValue;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Load and validate application configuration from environment variables
 *
 * @returns Validated application configuration
 * @throws {Error} If configuration is invalid
 */
export function loadConfig(): AppConfig {
  const env = process.env;
  const rawConfig = {
    nodeEnv: env['NODE_ENV'] ?? 'development',
    database: {
      host: env['DB_HOST'] ?? 'localhost',
      port: parseNumber(env['DB_PORT'], 5432),
      database: env['DB_NAME'] ?? 'graphile_worker',
      user: env['DB_USER'] ?? 'postgres',
      password: env['DB_PASSWORD'] ?? 'postgres',
      ssl: parseBoolean(env['DB_SSL'], false),
      maxConnections: parseNumber(env['DB_MAX_CONNECTIONS'], 10),
      idleTimeoutMillis: parseNumber(env['DB_IDLE_TIMEOUT_MS'], 30000),
      connectionTimeoutMillis: parseNumber(env['DB_CONNECTION_TIMEOUT_MS'], 5000),
    },
    worker: {
      concurrency: parseNumber(env['WORKER_CONCURRENCY'], 5),
      pollInterval: parseNumber(env['WORKER_POLL_INTERVAL'], 1000),
      preparedStatements: parseBoolean(env['WORKER_PREPARED_STATEMENTS'], false),
      schema: env['WORKER_SCHEMA'] ?? 'graphile_worker',
      noHandleSignals: parseBoolean(env['WORKER_NO_HANDLE_SIGNALS'], false),
      forbiddenFlags: env['WORKER_FORBIDDEN_FLAGS']?.split(','),
    },
    observability: {
      serviceName: process.env.SERVICE_NAME ?? 'graphile-worker-template',
      serviceVersion: process.env.SERVICE_VERSION ?? '1.0.0',
      environment: process.env.ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
      metrics: {
        enabled: parseBoolean(process.env.METRICS_ENABLED, true),
        port: parseNumber(process.env.METRICS_PORT, 9090),
        path: process.env.METRICS_PATH ?? '/metrics',
      },
      tracing: {
        enabled: parseBoolean(process.env.TRACING_ENABLED, true),
        otlpEndpoint: process.env.OTLP_ENDPOINT,
        sampleRate: parseFloatValue(process.env.TRACE_SAMPLE_RATE, 1.0),
      },
      logging: {
        level: process.env.LOG_LEVEL ?? 'info',
        pretty: parseBoolean(process.env.LOG_PRETTY, process.env.NODE_ENV === 'development'),
      },
    },
    healthCheck: {
      enabled: parseBoolean(process.env.HEALTH_CHECK_ENABLED, true),
      port: parseNumber(process.env.HEALTH_CHECK_PORT, 8080),
      path: process.env.HEALTH_CHECK_PATH ?? '/health',
      readinessPath: process.env.HEALTH_READINESS_PATH ?? '/health/ready',
      livenessPath: process.env.HEALTH_LIVENESS_PATH ?? '/health/live',
    },
    graphql: {
      enabled: parseBoolean(process.env.GRAPHQL_ENABLED, false),
      port: parseNumber(process.env.GRAPHQL_PORT, 5000),
      path: process.env.GRAPHQL_PATH ?? '/graphql',
      graphiqlRoute: process.env.GRAPHQL_GRAPHIQL_ROUTE ?? '/graphiql',
      graphiql: parseBoolean(process.env.GRAPHQL_GRAPHIQL, true),
      watch: parseBoolean(process.env.GRAPHQL_WATCH, false),
      enhanceGraphiql: parseBoolean(process.env.GRAPHQL_ENHANCE_GRAPHIQL, true),
      enableQueryBatching: parseBoolean(process.env.GRAPHQL_ENABLE_QUERY_BATCHING, true),
      legacyRelations:
        (process.env.GRAPHQL_LEGACY_RELATIONS as 'omit' | 'deprecated' | 'only') ?? 'omit',
      jwtSecret: process.env.GRAPHQL_JWT_SECRET,
      jwtTokenIdentifier: process.env.GRAPHQL_JWT_TOKEN_IDENTIFIER ?? 'app.jwt_token',
      enableIntrospection: parseBoolean(process.env.GRAPHQL_ENABLE_INTROSPECTION, true),
    },
    cors: {
      origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
      credentials: parseBoolean(process.env.CORS_CREDENTIALS, true),
      methods: process.env.CORS_METHODS?.split(','),
      allowedHeaders: process.env.CORS_ALLOWED_HEADERS?.split(','),
    },
    redis: process.env.REDIS_HOST
      ? {
          enabled: parseBoolean(process.env.REDIS_ENABLED, false),
          host: process.env.REDIS_HOST || 'localhost',
          port: parseNumber(process.env.REDIS_PORT, 6379),
          password: process.env.REDIS_PASSWORD,
          db: parseNumber(process.env.REDIS_DB, 0),
        }
      : undefined,
    featureFlags: {
      enableGraphiQL: parseBoolean(process.env.ENABLE_GRAPHIQL, true),
      enableIntrospection: parseBoolean(process.env.ENABLE_INTROSPECTION, true),
      enableDebugMode: parseBoolean(process.env.ENABLE_DEBUG_MODE, false),
    },
  };

  try {
    const validatedConfig = AppConfigSchema.parse(rawConfig);
    return validatedConfig;
  } catch (error) {
    console.error('Configuration validation failed:', error);
    throw new Error(`Invalid configuration: ${String(error)}`);
  }
}

/**
 * Singleton configuration instance
 */
let configInstance: AppConfig | null = null;

/**
 * Get configuration singleton
 *
 * @returns Application configuration
 */
export function getConfig(): AppConfig {
  configInstance ??= loadConfig();
  return configInstance;
}

/**
 * Reset configuration (useful for testing)
 */
export function resetConfig(): void {
  configInstance = null;
}

/**
 * Get database connection URL
 *
 * @param config - Optional config (uses singleton if not provided)
 * @returns PostgreSQL connection URL
 */
export function getDatabaseUrl(config?: AppConfig): string {
  const cfg = config ?? getConfig();
  return buildDatabaseUrl(cfg.database);
}

/**
 * Check if running in development mode
 */
export function isDevelopment(config?: AppConfig): boolean {
  const cfg = config ?? getConfig();
  return cfg.nodeEnv === 'development' || cfg.nodeEnv === 'test';
}

/**
 * Check if running in production mode
 */
export function isProduction(config?: AppConfig): boolean {
  const cfg = config ?? getConfig();
  return cfg.nodeEnv === 'production';
}

/**
 * Check if running in test mode
 */
export function isTest(config?: AppConfig): boolean {
  const cfg = config ?? getConfig();
  return cfg.nodeEnv === 'test';
}

// Export schemas and types
export * from './schema';
