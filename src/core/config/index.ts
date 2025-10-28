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
      serviceName: env['SERVICE_NAME'] ?? 'graphile-worker-template',
      serviceVersion: env['SERVICE_VERSION'] ?? '1.0.0',
      environment: env['ENVIRONMENT'] ?? env['NODE_ENV'] ?? 'development',
      metrics: {
        enabled: parseBoolean(env['METRICS_ENABLED'], true),
        port: parseNumber(env['METRICS_PORT'], 9090),
        path: env['METRICS_PATH'] ?? '/metrics',
      },
      tracing: {
        enabled: parseBoolean(env['TRACING_ENABLED'], true),
        otlpEndpoint: env['OTLP_ENDPOINT'],
        sampleRate: parseFloatValue(env['TRACE_SAMPLE_RATE'], 1.0),
      },
      logging: {
        level: env['LOG_LEVEL'] ?? 'info',
        pretty: parseBoolean(env['LOG_PRETTY'], env['NODE_ENV'] === 'development'),
      },
    },
    healthCheck: {
      enabled: parseBoolean(env['HEALTH_CHECK_ENABLED'], true),
      port: parseNumber(env['HEALTH_CHECK_PORT'], 8080),
      path: env['HEALTH_CHECK_PATH'] ?? '/health',
      readinessPath: env['HEALTH_READINESS_PATH'] ?? '/health/ready',
      livenessPath: env['HEALTH_LIVENESS_PATH'] ?? '/health/live',
    },
    graphql: {
      enabled: parseBoolean(env['GRAPHQL_ENABLED'], false),
      port: parseNumber(env['GRAPHQL_PORT'], 5000),
      path: env['GRAPHQL_PATH'] ?? '/graphql',
      graphiqlRoute: env['GRAPHQL_GRAPHIQL_ROUTE'] ?? '/graphiql',
      graphiql: parseBoolean(env['GRAPHQL_GRAPHIQL'], true),
      watch: parseBoolean(env['GRAPHQL_WATCH'], false),
      enhanceGraphiql: parseBoolean(env['GRAPHQL_ENHANCE_GRAPHIQL'], true),
      enableQueryBatching: parseBoolean(env['GRAPHQL_ENABLE_QUERY_BATCHING'], true),
      legacyRelations:
        (env['GRAPHQL_LEGACY_RELATIONS'] as 'omit' | 'deprecated' | 'only') ?? 'omit',
      jwtSecret: env['GRAPHQL_JWT_SECRET'],
      jwtTokenIdentifier: env['GRAPHQL_JWT_TOKEN_IDENTIFIER'] ?? 'app.jwt_token',
      enableIntrospection: parseBoolean(env['GRAPHQL_ENABLE_INTROSPECTION'], true),
    },
    cors: {
      origin: env['CORS_ORIGIN'] ?? 'http://localhost:3000',
      credentials: parseBoolean(env['CORS_CREDENTIALS'], true),
      methods: env['CORS_METHODS']?.split(','),
      allowedHeaders: env['CORS_ALLOWED_HEADERS']?.split(','),
    },
    redis: env['REDIS_HOST']
      ? {
          enabled: parseBoolean(env['REDIS_ENABLED'], false),
          host: env['REDIS_HOST'] ?? 'localhost',
          port: parseNumber(env['REDIS_PORT'], 6379),
          password: env['REDIS_PASSWORD'],
          db: parseNumber(env['REDIS_DB'], 0),
        }
      : undefined,
    featureFlags: {
      enableGraphiQL: parseBoolean(env['ENABLE_GRAPHIQL'], true),
      enableIntrospection: parseBoolean(env['ENABLE_INTROSPECTION'], true),
      enableDebugMode: parseBoolean(env['ENABLE_DEBUG_MODE'], false),
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
