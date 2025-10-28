/**
 * @fileoverview Zod schemas for application configuration with full type safety
 * @module core/config/schema
 */

import { z } from 'zod';

/**
 * Database configuration schema
 */
export const DatabaseConfigSchema = z.object({
  host: z.string().min(1).describe('Database host'),
  port: z.number().int().min(1).max(65535).default(5432).describe('Database port'),
  database: z.string().min(1).describe('Database name'),
  user: z.string().min(1).describe('Database user'),
  password: z.string().min(1).describe('Database password'),
  ssl: z.boolean().default(false).describe('Enable SSL connection'),
  maxConnections: z.number().int().min(1).default(10).describe('Maximum connection pool size'),
  idleTimeoutMillis: z
    .number()
    .int()
    .min(0)
    .default(30000)
    .describe('Idle connection timeout in milliseconds'),
  connectionTimeoutMillis: z
    .number()
    .int()
    .min(0)
    .default(5000)
    .describe('Connection timeout in milliseconds'),
});

/**
 * Graphile Worker configuration schema
 */
export const WorkerConfigSchema = z.object({
  concurrency: z.number().int().min(1).default(5).describe('Number of concurrent job executions'),
  pollInterval: z
    .number()
    .int()
    .min(100)
    .default(1000)
    .describe('Poll interval for new jobs in milliseconds'),
  preparedStatements: z.boolean().default(false).describe('Use prepared statements'),
  schema: z.string().default('graphile_worker').describe('Database schema for worker tables'),
  forbiddenFlags: z.array(z.string()).optional().describe('Forbidden job flags'),
  noHandleSignals: z
    .boolean()
    .default(false)
    .describe('Disable automatic signal handling for graceful shutdown'),
});

/**
 * Metrics configuration schema
 */
export const MetricsConfigSchema = z.object({
  enabled: z.boolean().default(true).describe('Enable metrics collection'),
  port: z.number().int().min(1).max(65535).default(9090).describe('Metrics server port'),
  path: z.string().default('/metrics').describe('Metrics endpoint path'),
});

/**
 * Tracing configuration schema
 */
export const TracingConfigSchema = z.object({
  enabled: z.boolean().default(true).describe('Enable distributed tracing'),
  otlpEndpoint: z.string().url().optional().describe('OTLP collector endpoint'),
  sampleRate: z.number().min(0).max(1).default(1.0).describe('Trace sample rate (0.0 to 1.0)'),
});

/**
 * Logging configuration schema
 */
export const LoggingConfigSchema = z.object({
  level: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info')
    .describe('Log level'),
  pretty: z.boolean().default(false).describe('Pretty print logs (development only)'),
});

/**
 * Observability configuration schema
 */
export const ObservabilityConfigSchema = z.object({
  serviceName: z.string().min(1).describe('Service name for observability'),
  serviceVersion: z.string().default('1.0.0').describe('Service version'),
  environment: z
    .enum(['development', 'staging', 'production', 'test'])
    .default('development')
    .describe('Deployment environment'),
  metrics: MetricsConfigSchema,
  tracing: TracingConfigSchema,
  logging: LoggingConfigSchema,
});

/**
 * Health check configuration schema
 */
export const HealthCheckConfigSchema = z.object({
  enabled: z.boolean().default(true).describe('Enable health check server'),
  port: z.number().int().min(1).max(65535).default(8080).describe('Health check server port'),
  path: z.string().default('/health').describe('Health check endpoint path'),
  readinessPath: z.string().default('/health/ready').describe('Readiness probe endpoint path'),
  livenessPath: z.string().default('/health/live').describe('Liveness probe endpoint path'),
});

/**
 * PostGraphile/GraphQL API configuration schema
 */
export const GraphQLConfigSchema = z.object({
  enabled: z.boolean().default(false).describe('Enable GraphQL API server'),
  port: z.number().int().min(1).max(65535).default(5000).describe('GraphQL server port'),
  path: z.string().default('/graphql').describe('GraphQL endpoint path'),
  graphiql: z.boolean().default(true).describe('Enable GraphiQL interface'),
  watch: z.boolean().default(false).describe('Watch database for schema changes'),
  enhanceGraphiql: z.boolean().default(true).describe('Enhance GraphiQL with additional features'),
  enableQueryBatching: z.boolean().default(true).describe('Enable query batching'),
  legacyRelations: z
    .enum(['omit', 'deprecated', 'only'])
    .default('omit')
    .describe('Legacy relations mode'),
  jwtSecret: z.string().optional().describe('JWT secret for authentication'),
  jwtTokenIdentifier: z
    .string()
    .default('app.jwt_token')
    .describe('PostgreSQL type identifier for JWT token'),
  enableIntrospection: z.boolean().default(true).describe('Enable GraphQL introspection'),
});

/**
 * CORS configuration schema
 */
export const CorsConfigSchema = z.object({
  origin: z
    .union([z.string(), z.array(z.string())])
    .default('http://localhost:3000')
    .describe('Allowed origins'),
  credentials: z.boolean().default(true).describe('Allow credentials'),
  methods: z.array(z.string()).optional().describe('Allowed HTTP methods'),
  allowedHeaders: z.array(z.string()).optional().describe('Allowed headers'),
});

/**
 * Redis configuration schema (optional)
 */
export const RedisConfigSchema = z
  .object({
    enabled: z.boolean().default(false).describe('Enable Redis'),
    host: z.string().default('localhost').describe('Redis host'),
    port: z.number().int().min(1).max(65535).default(6379).describe('Redis port'),
    password: z.string().optional().describe('Redis password'),
    db: z.number().int().min(0).default(0).describe('Redis database number'),
  })
  .optional();

/**
 * Feature flags schema
 */
export const FeatureFlagsSchema = z.object({
  enableGraphiQL: z.boolean().default(true).describe('Enable GraphiQL interface'),
  enableIntrospection: z.boolean().default(true).describe('Enable GraphQL introspection'),
  enableDebugMode: z.boolean().default(false).describe('Enable debug mode'),
});

/**
 * Main application configuration schema
 */
export const AppConfigSchema = z.object({
  nodeEnv: z
    .enum(['development', 'test', 'staging', 'production'])
    .default('development')
    .describe('Node environment'),
  database: DatabaseConfigSchema,
  worker: WorkerConfigSchema,
  observability: ObservabilityConfigSchema,
  healthCheck: HealthCheckConfigSchema,
  graphql: GraphQLConfigSchema,
  cors: CorsConfigSchema,
  redis: RedisConfigSchema,
  featureFlags: FeatureFlagsSchema,
});

/**
 * Inferred TypeScript types from schemas
 */
export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;
export type WorkerConfig = z.infer<typeof WorkerConfigSchema>;
export type MetricsConfig = z.infer<typeof MetricsConfigSchema>;
export type TracingConfig = z.infer<typeof TracingConfigSchema>;
export type LoggingConfig = z.infer<typeof LoggingConfigSchema>;
export type ObservabilityConfig = z.infer<typeof ObservabilityConfigSchema>;
export type HealthCheckConfig = z.infer<typeof HealthCheckConfigSchema>;
export type GraphQLConfig = z.infer<typeof GraphQLConfigSchema>;
export type CorsConfig = z.infer<typeof CorsConfigSchema>;
export type RedisConfig = z.infer<typeof RedisConfigSchema>;
export type FeatureFlags = z.infer<typeof FeatureFlagsSchema>;
export type AppConfig = z.infer<typeof AppConfigSchema>;

/**
 * Database connection string builder
 */
export function buildDatabaseUrl(config: DatabaseConfig): string {
  const { user, password, host, port, database } = config;
  return `postgresql://${user}:${password}@${host}:${port}/${database}${
    config.ssl ? '?ssl=true' : ''
  }`;
}

/**
 * Validate partial configuration against schema
 */
export function validatePartialConfig<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  return schema.parse(data);
}
