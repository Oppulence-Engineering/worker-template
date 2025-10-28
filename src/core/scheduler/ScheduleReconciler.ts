/**
 * @fileoverview Reconciles scheduled job definitions with Graphile Worker's known crontabs.
 * @module core/scheduler/ScheduleReconciler
 */

import { DatabaseError } from 'pg-protocol';

import type { Pool, PoolClient } from 'pg';
import type { Logger } from 'pino';
import type { ZodTypeAny } from 'zod';
import type { SchedulerMetrics } from '../instrumentation/metrics';
import type { ScheduledJobDefinition } from './types';

interface KnownCrontab {
  identifier: string;
  known_since: Date;
  last_execution: Date | null;
}

interface ScheduleReconcilerConfig {
  pool: Pool;
  schema: string;
  logger: Logger;
  metrics: SchedulerMetrics;
}

/**
 * Performs reconciliation between desired schedules and persisted cron metadata.
 */
export class ScheduleReconciler {
  private readonly pool: Pool;
  private readonly schema: string;
  private readonly logger: Logger;
  private readonly metrics: SchedulerMetrics;

  constructor(config: ScheduleReconcilerConfig) {
    this.pool = config.pool;
    this.schema = config.schema;
    this.logger = config.logger;
    this.metrics = config.metrics;
  }

  /**
   * Ensure known crontab metadata is in sync with registered definitions.
   */
  async reconcile(definitions: ScheduledJobDefinition<ZodTypeAny, unknown>[]): Promise<void> {
    const client = await this.pool.connect();

    try {
      await this.reconcileKnownCrontabs(client, definitions);
    } catch (error) {
      if (this.isUndefinedTableError(error)) {
        this.logger.warn(
          'Cron metadata table not yet available; skipping reconciliation until after migrations'
        );
        return;
      }
      throw error;
    } finally {
      client.release();
    }
  }

  private async reconcileKnownCrontabs(
    client: PoolClient,
    definitions: ScheduledJobDefinition<ZodTypeAny, unknown>[]
  ): Promise<void> {
    const knownCrontabs = await this.fetchKnownCrontabs(client);

    const desiredIdentifiers = new Set(
      definitions.map((definition) => definition.identifier ?? definition.key)
    );

    const missing = definitions.filter(
      (definition) => !knownCrontabs.has(definition.identifier ?? definition.key)
    );

    if (missing.length > 0) {
      await this.insertMissingCrontabs(client, missing);
      this.logger.info(
        { identifiers: missing.map((definition) => definition.identifier ?? definition.key) },
        'Registered missing cron identifiers'
      );
      this.metrics.recordReconciliation('inserted', missing.length);
    }

    const stale = Array.from(knownCrontabs.keys()).filter(
      (identifier) => !desiredIdentifiers.has(identifier)
    );

    if (stale.length > 0) {
      this.logger.warn(
        { identifiers: stale },
        'Detected stale cron identifiers without matching schedule definition'
      );
      this.metrics.recordReconciliation('stale', stale.length);
    }
  }

  private async fetchKnownCrontabs(client: PoolClient): Promise<Map<string, KnownCrontab>> {
    const result = await client.query<KnownCrontab>(
      `select identifier, known_since, last_execution from ${this.schema}._private_known_crontabs`
    );

    const records = new Map<string, KnownCrontab>();
    for (const row of result.rows) {
      records.set(row.identifier, row);
    }
    return records;
  }

  private async insertMissingCrontabs(
    client: PoolClient,
    definitions: ScheduledJobDefinition<ZodTypeAny, unknown>[]
  ): Promise<void> {
    const identifiers = definitions.map((definition) => definition.identifier ?? definition.key);
    await client.query(
      `insert into ${this.schema}._private_known_crontabs (identifier, known_since)
       select identifier, now()
       from unnest($1::text[]) as t(identifier)
       on conflict do nothing`,
      [identifiers]
    );
  }

  private isUndefinedTableError(error: unknown): boolean {
    if (error instanceof DatabaseError) {
      return error.code === '42P01';
    }
    return false;
  }
}
