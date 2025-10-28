/**
 * @fileoverview Unit tests for retry strategies
 * @module tests/unit/retry-strategy
 */

import { describe, it, expect } from 'bun:test';
import {
  ExponentialBackoffStrategy,
  LinearBackoffStrategy,
  ConstantBackoffStrategy,
} from '../../src/jobs/base/RetryableJob';

describe('unit: Retry Strategies', () => {
  describe('ExponentialBackoffStrategy', () => {
    it('should calculate exponential backoff delays', () => {
      const strategy = new ExponentialBackoffStrategy();
      const config = {
        baseDelay: 1000,
        maxDelay: 60000,
        factor: 2,
        jitter: false,
      };

      const delay1 = strategy.calculateDelay(1, config);
      const delay2 = strategy.calculateDelay(2, config);
      const delay3 = strategy.calculateDelay(3, config);

      expect(delay1).toBe(1000); // 1000 * 2^0
      expect(delay2).toBe(2000); // 1000 * 2^1
      expect(delay3).toBe(4000); // 1000 * 2^2
    });

    it('should respect maxDelay cap', () => {
      const strategy = new ExponentialBackoffStrategy();
      const config = {
        baseDelay: 1000,
        maxDelay: 5000,
        factor: 2,
        jitter: false,
      };

      const delay10 = strategy.calculateDelay(10, config);

      // 1000 * 2^9 = 512000, but should be capped at maxDelay
      expect(delay10).toBe(5000);
    });

    it('should add jitter when enabled', () => {
      const strategy = new ExponentialBackoffStrategy();
      const config = {
        baseDelay: 1000,
        maxDelay: 60000,
        factor: 2,
        jitter: true,
      };

      const delays = [];
      for (let i = 0; i < 10; i++) {
        delays.push(strategy.calculateDelay(3, config));
      }

      // With jitter, delays should vary
      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBeGreaterThan(1);

      // All delays should be near 4000 (±25%)
      delays.forEach((delay) => {
        expect(delay).toBeGreaterThanOrEqual(3000);
        expect(delay).toBeLessThanOrEqual(5000);
      });
    });

    it('should return 0 or positive delays', () => {
      const strategy = new ExponentialBackoffStrategy();
      const config = {
        baseDelay: 1000,
        maxDelay: 60000,
        factor: 2,
        jitter: false,
      };

      for (let i = 1; i <= 10; i++) {
        const delay = strategy.calculateDelay(i, config);
        expect(delay).toBeGreaterThanOrEqual(0);
      }
    });

    it('should allow retry until maxAttempts', () => {
      const strategy = new ExponentialBackoffStrategy();
      const error = new Error('Test error');

      expect(strategy.shouldRetry(1, 3, error)).toBe(true);
      expect(strategy.shouldRetry(2, 3, error)).toBe(true);
      expect(strategy.shouldRetry(3, 3, error)).toBe(false);
      expect(strategy.shouldRetry(4, 3, error)).toBe(false);
    });
  });

  describe('LinearBackoffStrategy', () => {
    it('should calculate linear backoff delays', () => {
      const strategy = new LinearBackoffStrategy();
      const config = {
        baseDelay: 1000,
        maxDelay: 10000,
      };

      const delay1 = strategy.calculateDelay(1, config);
      const delay2 = strategy.calculateDelay(2, config);
      const delay3 = strategy.calculateDelay(3, config);

      expect(delay1).toBe(1000); // 1000 * 1
      expect(delay2).toBe(2000); // 1000 * 2
      expect(delay3).toBe(3000); // 1000 * 3
    });

    it('should respect maxDelay cap', () => {
      const strategy = new LinearBackoffStrategy();
      const config = {
        baseDelay: 1000,
        maxDelay: 5000,
      };

      const delay10 = strategy.calculateDelay(10, config);

      // 1000 * 10 = 10000, but should be capped at 5000
      expect(delay10).toBe(5000);
    });

    it('should allow retry until maxAttempts', () => {
      const strategy = new LinearBackoffStrategy();
      const error = new Error('Test error');

      expect(strategy.shouldRetry(1, 5, error)).toBe(true);
      expect(strategy.shouldRetry(4, 5, error)).toBe(true);
      expect(strategy.shouldRetry(5, 5, error)).toBe(false);
    });
  });

  describe('ConstantBackoffStrategy', () => {
    it('should return constant delay', () => {
      const strategy = new ConstantBackoffStrategy();
      const config = { delay: 5000 };

      const delay1 = strategy.calculateDelay(1, config);
      const delay2 = strategy.calculateDelay(2, config);
      const delay3 = strategy.calculateDelay(3, config);
      const delay10 = strategy.calculateDelay(10, config);

      expect(delay1).toBe(5000);
      expect(delay2).toBe(5000);
      expect(delay3).toBe(5000);
      expect(delay10).toBe(5000);
    });

    it('should allow retry until maxAttempts', () => {
      const strategy = new ConstantBackoffStrategy();
      const error = new Error('Test error');

      expect(strategy.shouldRetry(1, 3, error)).toBe(true);
      expect(strategy.shouldRetry(2, 3, error)).toBe(true);
      expect(strategy.shouldRetry(3, 3, error)).toBe(false);
    });
  });

  describe('Strategy Comparison', () => {
    it('should show different growth patterns', () => {
      const exponential = new ExponentialBackoffStrategy();
      const linear = new LinearBackoffStrategy();

      const expConfig = { baseDelay: 1000, maxDelay: 100000, factor: 2, jitter: false };
      const linConfig = { baseDelay: 1000, maxDelay: 100000 };

      const expDelays = [];
      const linDelays = [];

      for (let i = 1; i <= 5; i++) {
        expDelays.push(exponential.calculateDelay(i, expConfig));
        linDelays.push(linear.calculateDelay(i, linConfig));
      }

      // Exponential should grow faster
      expect(expDelays[4]).toBeGreaterThan(linDelays[4]);

      console.log('Exponential delays:', expDelays);
      console.log('Linear delays:', linDelays);
    });
  });
});
