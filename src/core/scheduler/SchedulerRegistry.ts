/**
 * @fileoverview Registry responsible for managing scheduled job definitions.
 * @module core/scheduler/SchedulerRegistry
 */

import type { Logger } from 'pino';
import { parseCronItems, type CronItem, type ParsedCronItem } from 'graphile-worker';
import { z } from 'zod';

import type { SchedulerMetrics } from '../instrumentation/metrics';
import type { IJob, JobName } from '../types';
import type { ScheduledJobDefinition } from './types';
import { SchedulerOptionsSchema } from './types';
import { ScheduledJobAdapter } from './ScheduledJobAdapter';

const EmptyPayloadSchema = z.object({}).passthrough();

/**
 * Registry for scheduled job definitions.
 */
export class SchedulerRegistry {
  private readonly definitions = new Map<JobName, ScheduledJobDefinition<z.ZodTypeAny, unknown>>();
  private readonly logger?: Logger;

  constructor(logger?: Logger) {
    this.logger = logger;
  }

  /**
   * Register a single scheduled job definition.
   */
  register<TPayloadSchema extends z.ZodTypeAny, TResult>(
    definition: ScheduledJobDefinition<TPayloadSchema, TResult>
  ): this {
    if (this.definitions.has(definition.key)) {
      throw new Error(`Schedule '${definition.key}' is already registered`);
    }

    const normalized = definition as unknown as ScheduledJobDefinition<z.ZodTypeAny, unknown>;
    this.definitions.set(definition.key, normalized);
    this.logger?.info({ schedule: definition.key }, 'Registered scheduled job');
    return this;
  }

  /**
   * Register multiple scheduled job definitions.
   */
  registerMany(definitions: Array<ScheduledJobDefinition<z.ZodTypeAny, unknown>>): this {
    definitions.forEach((definition) => this.register(definition));
    return this;
  }

  /**
   * Retrieve all registered definitions.
   */
  getDefinitions(): ScheduledJobDefinition<z.ZodTypeAny, unknown>[] {
    return Array.from(this.definitions.values());
  }

  /**
   * Create Graphile Worker jobs for all scheduled definitions.
   */
  createJobs(
    metrics: SchedulerMetrics
  ): Array<IJob<z.ZodTypeAny, unknown, Record<string, unknown>>> {
    return this.getDefinitions().map(
      (definition) =>
        new ScheduledJobAdapter(definition, metrics) as IJob<
          z.ZodTypeAny,
          unknown,
          Record<string, unknown>
        >
    );
  }

  /**
   * Build CronItem representations for all definitions and validate them using Graphile Worker.
   */
  async compileCronItems(metrics?: SchedulerMetrics): Promise<ParsedCronItem[]> {
    const cronItems: CronItem[] = [];

    for (const definition of this.getDefinitions()) {
      const options = definition.options
        ? SchedulerOptionsSchema.parse(definition.options)
        : undefined;

      const payload = await this.resolvePayload(definition, metrics);

      cronItems.push({
        task: definition.key,
        match: definition.cron,
        options: options
          ? {
              backfillPeriod: options.backfillPeriod,
              maxAttempts: options.maxAttempts,
              priority: options.priority,
              queueName: options.queueName,
              jobKey: options.jobKey,
              jobKeyMode: options.jobKeyMode,
            }
          : undefined,
        payload: payload ?? {},
        identifier: definition.identifier ?? definition.key,
      });
    }

    return parseCronItems(cronItems);
  }

  private async resolvePayload<TPayloadSchema extends z.ZodTypeAny, TResult>(
    definition: ScheduledJobDefinition<TPayloadSchema, TResult>,
    metrics?: SchedulerMetrics
  ): Promise<Record<string, unknown> | null> {
    if (!definition.payloadFactory) {
      return null;
    }

    const resolved = await definition.payloadFactory();
    const schema = definition.payloadSchema ?? EmptyPayloadSchema;

    try {
      const parsed = schema.parse(resolved);
      return parsed as Record<string, unknown>;
    } catch (error) {
      metrics?.recordValidationFailure(definition.key, (error as Error).message);
      throw error;
    }
  }
}
