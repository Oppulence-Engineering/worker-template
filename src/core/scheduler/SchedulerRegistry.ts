/**
 * @fileoverview Registry responsible for managing scheduled job definitions.
 * @module core/scheduler/SchedulerRegistry
 */

import { parseCronItems, type CronItem, type ParsedCronItem } from 'graphile-worker';
import { z } from 'zod';

import { ScheduledJobAdapter } from './ScheduledJobAdapter';
import { SchedulerOptionsSchema } from './types';

import type { SchedulerMetrics } from '../instrumentation/metrics';
import type { IJob, JobName } from '../types';
import type { ScheduledJobDefinition } from './types';
import type { Logger } from 'pino';

const EmptyPayloadSchema = z.object({}).passthrough();

/**
 * Registry responsible for owning and reconciling {@link ScheduledJobDefinition} instances.
 *
 * @remarks
 * Typical usage inside worker bootstrap:
 *
 * ```ts
 * const registry = new SchedulerRegistry(logger);
 * registry.register(nightlyReportJob);
 *
 * const scheduledJobs = registry.createJobs(schedulerMetrics);
 * registry.registerMany(otherWorkflows);
 *
 * const cronItems = await registry.compileCronItems();
 * ```
 */
export class SchedulerRegistry {
  private readonly definitions = new Map<JobName, ScheduledJobDefinition<z.ZodTypeAny, unknown>>();
  private readonly logger?: Logger;

  constructor(logger?: Logger) {
    this.logger = logger;
  }

  /**
   * Register a single scheduled job definition.
   *
   * @example
   * ```ts
   * registry.register({
   *   key: 'cleanup',
   *   cron: '0 3 * * *',
   *   payloadSchema: CleanupPayloadSchema,
   *   handler: cleanupStaleData,
   * });
   * ```
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
   * Register multiple scheduled job definitions at once.
   *
   * @example
   * ```ts
   * registry.registerMany([
   *   nightlyReportJob,
   *   customerSummaryJob,
   * ]);
   * ```
   */
  registerMany(definitions: Array<ScheduledJobDefinition<z.ZodTypeAny, unknown>>): this {
    definitions.forEach((definition) => this.register(definition));
    return this;
  }

  /**
   * Retrieve all registered definitions in insertion order.
   */
  getDefinitions(): ScheduledJobDefinition<z.ZodTypeAny, unknown>[] {
    return Array.from(this.definitions.values());
  }

  /**
   * Instantiate Graphile Worker task implementations for every registered schedule.
   *
   * @remarks
   * The returned jobs can be fed to {@link JobRegistry.registerMany} or used
   * directly when building the worker task list.
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
   * Build {@link CronItem} representations for every definition and validate
   * them using Graphile Worker helpers.
   *
  * @remarks
  * The resulting {@link ParsedCronItem} array can be supplied to the Graphile worker runner:
  *
  * ```ts
  * const cronItems = await registry.compileCronItems();
  * await run({ ...runnerOptions, parsedCronItems: cronItems });
  * ```
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

  /**
   * Resolve and validate the payload that will be scheduled for a cron entry.
   *
   * @throws {Error} When payloadFactory output fails schema validation.
   */
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
      const parsed: unknown = schema.parse(resolved);
      return parsed as Record<string, unknown>;
    } catch (error) {
      metrics?.recordValidationFailure(definition.key, (error as Error).message ?? 'Unknown error');
      throw error;
    }
  }
}
