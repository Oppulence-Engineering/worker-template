/**
 * @fileoverview Unit tests for configuration system
 * @module tests/unit/config
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  AppConfigSchema,
  DatabaseConfigSchema,
  WorkerConfigSchema,
} from '../../src/core/config/schema';

describe('unit: Configuration Schema Validation', () => {
  describe('DatabaseConfigSchema', () => {
    it('should validate valid database configuration', () => {
      const validConfig = {
        host: 'localhost',
        port: 5432,
        database: 'test_db',
        user: 'test_user',
        password: 'test_password',
        ssl: false,
        maxConnections: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      };

      const result = DatabaseConfigSchema.safeParse(validConfig);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.host).toBe('localhost');
        expect(result.data.port).toBe(5432);
        expect(result.data.maxConnections).toBe(10);
      }
    });

    it('should apply default values for optional fields', () => {
      const minimalConfig = {
        host: 'localhost',
        database: 'test_db',
        user: 'test_user',
        password: 'test_password',
      };

      const result = DatabaseConfigSchema.safeParse(minimalConfig);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.port).toBe(5432); // default
        expect(result.data.ssl).toBe(false); // default
        expect(result.data.maxConnections).toBe(10); // default
      }
    });

    it('should reject invalid port numbers', () => {
      const invalidConfig = {
        host: 'localhost',
        port: 99999, // Invalid port
        database: 'test_db',
        user: 'test_user',
        password: 'test_password',
      };

      const result = DatabaseConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it('should reject negative maxConnections', () => {
      const invalidConfig = {
        host: 'localhost',
        database: 'test_db',
        user: 'test_user',
        password: 'test_password',
        maxConnections: -1,
      };

      const result = DatabaseConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });
  });

  describe('WorkerConfigSchema', () => {
    it('should validate valid worker configuration', () => {
      const validConfig = {
        concurrency: 5,
        pollInterval: 1000,
        preparedStatements: false,
        schema: 'graphile_worker',
        noHandleSignals: false,
      };

      const result = WorkerConfigSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });

    it('should apply default values', () => {
      const minimalConfig = {};

      const result = WorkerConfigSchema.safeParse(minimalConfig);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.concurrency).toBe(5);
        expect(result.data.pollInterval).toBe(1000);
        expect(result.data.schema).toBe('graphile_worker');
      }
    });

    it('should reject concurrency less than 1', () => {
      const invalidConfig = {
        concurrency: 0,
      };

      const result = WorkerConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it('should accept custom schema name', () => {
      const config = {
        schema: 'custom_schema',
      };

      const result = WorkerConfigSchema.safeParse(config);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.schema).toBe('custom_schema');
      }
    });
  });

  describe('AppConfigSchema', () => {
    it('should validate complete application configuration', () => {
      const validConfig = {
        nodeEnv: 'test',
        database: {
          host: 'localhost',
          port: 5432,
          database: 'test_db',
          user: 'test_user',
          password: 'test_password',
        },
        worker: {
          concurrency: 3,
        },
        observability: {
          serviceName: 'test-service',
          serviceVersion: '1.0.0',
          environment: 'test',
          metrics: {
            enabled: true,
            port: 9090,
          },
          tracing: {
            enabled: true,
            sampleRate: 1.0,
          },
          logging: {
            level: 'info',
            pretty: false,
          },
        },
        healthCheck: {
          enabled: true,
          port: 8080,
        },
        graphql: {
          enabled: false,
        },
        cors: {
          origin: 'http://localhost:3000',
        },
        featureFlags: {},
      };

      const result = AppConfigSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });

    it('should validate observability metrics configuration', () => {
      const config = {
        nodeEnv: 'development',
        database: {
          host: 'localhost',
          database: 'test',
          user: 'test',
          password: 'test',
        },
        worker: {},
        observability: {
          serviceName: 'test',
          metrics: {
            enabled: false,
            port: 9999,
          },
          tracing: {
            enabled: false,
          },
          logging: {
            level: 'debug',
          },
        },
        healthCheck: {},
        graphql: {},
        cors: {},
        featureFlags: {},
      };

      const result = AppConfigSchema.safeParse(config);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.observability.metrics.port).toBe(9999);
        expect(result.data.observability.logging.level).toBe('debug');
      }
    });
  });
});
