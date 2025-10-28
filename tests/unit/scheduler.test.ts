/**
 * @fileoverview Scheduler registry and adapter unit tests
 * @module tests/unit/scheduler
 */

import { describe, expect, it, mock } from 'bun:test';
import { z } from 'zod';

import { DatabaseError } from 'pg-protocol';
import type { SchedulerMetrics } from '../../src/core/instrumentation/metrics';
import type { ScheduledJobDefinition } from '../../src/core/scheduler';
import { ScheduledJobAdapter } from '../../src/core/scheduler/ScheduledJobAdapter';
import { ScheduleReconciler } from '../../src/core/scheduler/ScheduleReconciler';
import { SchedulerRegistry } from '../../src/core/scheduler/SchedulerRegistry';

const TestPayloadSchema = z.object({
  message: z.string(),
});

const createMetrics = (): SchedulerMetrics =>
  ({
    recordExecution: mock(() => {}),
    recordReconciliation: mock(() => {}),
    recordValidationFailure: mock(() => {}),
    recordCustomMetrics: mock(() => {}),
  } as unknown as SchedulerMetrics);

describe('unit: Scheduler Registry', () => {
  const metrics = createMetrics();

  const TestPayloadSchema = z.object({
    message: z.string(),
  });

  const testDefinition: ScheduledJobDefinition<typeof TestPayloadSchema, string> = {
    key: 'test-job',
    cron: '* * * * *',
    payloadSchema: TestPayloadSchema,
    handler: async () => 'ok',
  };

  it('registers jobs and prevents duplicates', () => {
    const registry = new SchedulerRegistry();
    registry.register(testDefinition);

    expect(registry.getDefinitions()).toHaveLength(1);
    expect(() => registry.register(testDefinition)).toThrowError(
      "Schedule 'test-job' is already registered"
    );
  });

  it('creates job adapters with metrics wiring', () => {
    const registry = new SchedulerRegistry();
    registry.register(testDefinition);

    const jobs = registry.createJobs(metrics);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toBeInstanceOf(ScheduledJobAdapter);
  });

  it('compiles cron items and validates payloads', async () => {
    const registry = new SchedulerRegistry();
    const definition: ScheduledJobDefinition<typeof TestPayloadSchema, void> = {
      ...testDefinition,
      key: 'cron-job',
      identifier: 'cron-job',
      options: {
        backfillPeriod: 60_000,
        maxAttempts: 2,
        priority: 1,
        queueName: 'cron-queue' as never,
        jobKey: 'cron-key',
        jobKeyMode: 'replace',
      },
      payloadFactory: () => ({ message: 'hello' }),
    };

    registry.register(definition);

    const cronItems = await registry.compileCronItems(metrics);
    expect(cronItems).toHaveLength(1);
    expect(cronItems[0].identifier).toBe('cron-job');
    expect(cronItems[0].options?.backfillPeriod).toBe(60_000);
  });

  it('records validation failures when payload factory produces invalid payload', async () => {
    const registry = new SchedulerRegistry();
    const invalidDefinition: ScheduledJobDefinition<typeof TestPayloadSchema> = {
      ...testDefinition,
      key: 'invalid-payload',
      payloadFactory: () => ({}) as never,
    };

    registry.register(invalidDefinition);

    await expect(registry.compileCronItems(metrics)).rejects.toThrowError();
    expect(metrics.recordValidationFailure).toHaveBeenCalledWith('invalid-payload', expect.any(String));
  });
});

describe('unit: Schedule Reconciler', () => {
  const baseMetrics = createMetrics();

  it('skips reconciliation when crontab table is missing', async () => {
    const logger = {
      warn: mock(() => {}),
      info: mock(() => {}),
    };

    const pool = {
      connect: async () => ({
        query: async () => {
          const error = new DatabaseError('relation missing', 0, 'error');
          error.code = '42P01';
          throw error;
        },
        release: () => {},
      }),
    } as unknown as Parameters<ScheduleReconciler['reconcile']>[0];

    const reconciler = new ScheduleReconciler({
      pool,
      schema: 'graphile_worker',
      logger: logger as any,
      metrics: baseMetrics,
    });

    await reconciler.reconcile([]);
    expect(logger.warn).toHaveBeenCalledWith(
      'Cron metadata table not yet available; skipping reconciliation until after migrations'
    );
  });

  it('records inserted and stale identifiers', async () => {
    const queryMock = mock(async (sql: string) => {
      if (sql.includes('_private_known_crontabs')) {
        return { rows: [{ identifier: 'existing', known_since: new Date(), last_execution: null }] };
      }

      return { rows: [] };
    });

    const pool = {
      connect: async () => ({
        query: queryMock,
        release: () => {},
      }),
    } as unknown as Parameters<ScheduleReconciler['reconcile']>[0];

    const logger = {
      warn: mock(() => {}),
      info: mock(() => {}),
    } as unknown as Parameters<typeof ScheduleReconciler>[0]['logger'];

    const reconciler = new ScheduleReconciler({
      pool,
      schema: 'graphile_worker',
      logger: logger as any,
      metrics: baseMetrics,
    });

    const definitions: ScheduledJobDefinition<typeof TestPayloadSchema, unknown>[] = [
      {
        key: 'existing',
        cron: '* * * * *',
        payloadSchema: TestPayloadSchema,
        handler: async () => undefined,
      },
      {
        key: 'new-schedule',
        cron: '* * * * *',
        payloadSchema: TestPayloadSchema,
        handler: async () => undefined,
      },
    ];

    await reconciler.reconcile(
      definitions as ScheduledJobDefinition<z.ZodTypeAny, unknown>[]
    );

    expect(queryMock).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      { identifiers: ['new-schedule'] },
      'Registered missing cron identifiers'
    );
    expect(baseMetrics.recordReconciliation).toHaveBeenCalledWith('inserted', 1);
  });
});
