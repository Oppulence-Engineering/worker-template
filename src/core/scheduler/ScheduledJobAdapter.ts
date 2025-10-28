/**
 * @fileoverview Adapter that exposes scheduled job definitions as Graphile Worker jobs.
 * @module core/scheduler/ScheduledJobAdapter
 */


import { BaseJob } from '../abstractions/BaseJob';

import {
  CronMetadataSchema,
  ScheduledJobMetadataSchema,
  SchedulerPayloadEnvelopeSchema,
} from './types';

import type { SchedulerMetrics } from '../instrumentation/metrics';
import type { JobConfig, JobContext, JobHelpers, JobName } from '../types';
import type {
  CronMetadata,
  ScheduledJobDefinition,
  ScheduledJobMetadata,
  SchedulerHandlerContext,
} from './types';
import type { Span } from '@opentelemetry/api';
import type { z } from 'zod';

/**
 * Adapter that wraps a {@link ScheduledJobDefinition} in the {@link BaseJob} lifecycle.
 */
export class ScheduledJobAdapter<TPayloadSchema extends z.ZodTypeAny, TResult> extends BaseJob<
  TPayloadSchema,
  TResult
> {
  public readonly jobName: JobName;
  public readonly schema: TPayloadSchema;
  public readonly defaultConfig: Partial<JobConfig>;

  private readonly definition: ScheduledJobDefinition<TPayloadSchema, TResult>;
  private readonly metrics: SchedulerMetrics;

  constructor(
    definition: ScheduledJobDefinition<TPayloadSchema, TResult>,
    metrics: SchedulerMetrics
  ) {
    super();
    this.definition = definition;
    this.metrics = metrics;
    this.jobName = definition.key;
    this.schema = definition.payloadSchema;
    this.defaultConfig = this.buildDefaultConfig(definition);
  }

  /**
   * Override payload validation to ignore cron envelope fields.
   */
  override validate(payload: unknown): z.infer<TPayloadSchema> {
    const sanitized = this.stripCronMetadata(payload);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.definition.payloadSchema.parse(sanitized) as z.infer<TPayloadSchema>;
  }

  /**
   * Populate job metadata with cron information for downstream handlers.
   */
  protected override createContext(
    helpers: JobHelpers,
    span: Span
  ): JobContext<Record<string, unknown>> {
    const cronMetadata = this.extractCronMetadata(helpers.job.payload);

    const metadataRecord: Record<string, unknown> = {
      scheduleKey: String(this.definition.key),
      identifier: this.definition.identifier ?? String(this.definition.key),
      scheduledAt: cronMetadata.ts,
      isBackfill: cronMetadata.backfilled,
      timezone: this.definition.timezone,
    };

    return super.createContext(helpers, span, metadataRecord);
  }

  /**
   * Record execution start to compute duration in lifecycle hooks.
   */
  override async beforeExecute(
    payload: z.infer<TPayloadSchema>,
    context: JobContext<Record<string, unknown>>
  ): Promise<void> {
    const metadata = this.parseMetadata(context.metadata);
    metadata.runtime = { startedAt: Date.now() };
    Object.assign(context.metadata, metadata);
    await super.beforeExecute(payload, context);
  }

  /**
   * Execute scheduled job handler.
   */
  override async execute(
    payload: z.infer<TPayloadSchema>,
    context: JobContext<Record<string, unknown>>
  ): Promise<TResult> {
    const schedulerContext = this.createHandlerContext(context);
    return this.definition.handler(payload, schedulerContext);
  }

  /**
   * Emit metrics and invoke success hook.
   */
  override async afterExecute(
    result: TResult,
    context: JobContext<Record<string, unknown>>
  ): Promise<void> {
    await super.afterExecute(result, context);
    const schedulerContext = this.createHandlerContext(context);
    this.recordDuration(context.metadata, true);
    if (this.definition.onSuccess) {
      await this.definition.onSuccess(result, schedulerContext);
    }
  }

  /**
   * Emit metrics and invoke custom error hook.
   */
  override async onError(
    error: Error,
    context: JobContext<Record<string, unknown>>
  ): Promise<void> {
    await super.onError(error, context);
    this.recordDuration(context.metadata, false);
    if (this.definition.onError) {
      const schedulerContext = this.createHandlerContext(context);
      await this.definition.onError(error, schedulerContext);
    }
  }

  private createHandlerContext(
    context: JobContext<Record<string, unknown>>
  ): SchedulerHandlerContext {
    const metadata = this.parseMetadata(context.metadata);
    return {
      logger: context.logger,
      jobName: context.jobName,
      scheduledAt: metadata.scheduledAt,
      isBackfill: metadata.isBackfill,
      timezone: metadata.timezone,
      helpers: context.helpers,
      recordMetrics: (metrics) => this.metrics.recordCustomMetrics(context.jobName, metrics),
    };
  }

  private recordDuration(metadataRecord: Record<string, unknown>, success: boolean): void {
    const metadata = this.parseMetadata(metadataRecord);
    const startedAt = metadata.runtime?.startedAt ?? Date.now();
    const duration = Math.max(Date.now() - startedAt, 0);
    this.metrics.recordExecution(metadata.scheduleKey, duration, success, metadata.isBackfill);
  }

  private stripCronMetadata(payload: unknown): unknown {
    if (payload && typeof payload === 'object') {
      const candidate = payload as Record<string, unknown>;
      const { _cron, ...rest } = candidate;
      void _cron;
      return rest;
    }
    return payload;
  }

  private extractCronMetadata(payload: unknown): CronMetadata {
    if (payload && typeof payload === 'object') {
      const envelopeResult = SchedulerPayloadEnvelopeSchema.safeParse(payload);
      if (envelopeResult.success && envelopeResult.data._cron) {
        const cronResult = CronMetadataSchema.safeParse(envelopeResult.data._cron);
        if (cronResult.success) {
          return cronResult.data;
        }
      }
    }

    return {
      ts: new Date(),
      backfilled: false,
    };
  }

  private parseMetadata(metadata: Record<string, unknown>): ScheduledJobMetadata {
    return ScheduledJobMetadataSchema.parse(metadata);
  }

  private buildDefaultConfig(
    definition: ScheduledJobDefinition<TPayloadSchema, TResult>
  ): Partial<JobConfig> {
    const config: Partial<JobConfig> = {
      maxAttempts: definition.options?.maxAttempts ?? 1,
      priority: definition.options?.priority,
    };

    if (definition.options?.queueName) {
      config.queue = definition.options.queueName;
    }

    if (definition.options?.jobKey) {
      config.jobKey = definition.options.jobKey;
    }

    if (definition.options?.jobKeyMode) {
      config.jobKeyMode = definition.options.jobKeyMode;
    }

    return config;
  }
}
