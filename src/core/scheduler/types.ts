/**
 * @fileoverview Type definitions and Zod schemas for the scheduler subsystem.
 * @module core/scheduler/types
 */

import { z } from 'zod';

import type { JobName, JobPriority, QueueName } from '../types';
import type {
  AddJobFunction,
  JobHelpers,
  Logger as GraphileLogger,
  TaskSpec,
} from 'graphile-worker';


/**
 * Zod schema capturing Graphile Worker's cron metadata shape.
 */
const CronTimestampSchema = z.union([z.string().datetime({ offset: true }), z.date()]);

export const CronMetadataSchema = z
  .object({
    ts: CronTimestampSchema,
    backfilled: z.boolean().optional(),
  })
  .transform((value) => ({
    ts: value.ts instanceof Date ? value.ts : new Date(value.ts),
    backfilled: value.backfilled ?? false,
  }));

/**
 * Envelope schema for payloads produced by Graphile Worker's cron subsystem.
 */
export const SchedulerPayloadEnvelopeSchema = z.object({
  _cron: CronMetadataSchema.optional(),
});

/**
 * Parsed cron metadata type.
 */
export type CronMetadata = z.output<typeof CronMetadataSchema>;

/**
 * Scheduler options schema aligning with {@link CronItemOptions}.
 */
const queueNameSchema = z
  .string()
  .min(1)
  .transform((value) => value as QueueName);

const jobPriorityValues = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5] as const;

const prioritySchema = z
  .number()
  .int()
  .refine((value): value is (typeof jobPriorityValues)[number] =>
    jobPriorityValues.includes(value as (typeof jobPriorityValues)[number])
  )
  .transform((value) => value as JobPriority);

export const SchedulerOptionsSchema = z.object({
  backfillPeriod: z.number().int().min(0).default(0),
  maxAttempts: z.number().int().min(1).optional(),
  queueName: queueNameSchema.optional(),
  priority: prioritySchema.optional(),
  jobKey: z.string().min(1).optional(),
  jobKeyMode: z.enum(['replace', 'preserve_run_at']).optional(),
});

/**
 * Scheduler options type.
 */
export type SchedulerOptions = z.infer<typeof SchedulerOptionsSchema>;

/**
 * Metadata stored on the job context for scheduled executions.
 */
export interface ScheduledJobMetadata {
  scheduleKey: string;
  identifier: string;
  scheduledAt: Date;
  isBackfill: boolean;
  timezone?: string;
  runtime?: {
    startedAt: number;
  };
}

export const ScheduledJobMetadataSchema = z.object({
  scheduleKey: z.string().min(1),
  identifier: z.string().min(1),
  scheduledAt: z.date(),
  isBackfill: z.boolean(),
  timezone: z.string().optional(),
  runtime: z
    .object({
      startedAt: z.number().int().min(0),
    })
    .optional(),
});

/**
 * Handler context surfaced to scheduled job handlers.
 */
export interface SchedulerHandlerContext {
  logger: GraphileLogger;
  jobName: JobName;
  scheduledAt: Date;
  isBackfill: boolean;
  timezone?: string;
  helpers: JobHelpers;
  recordMetrics: (metrics: Record<string, number>) => void;
}

/**
 * Definition describing a recurring scheduled job.
 */
export interface ScheduledJobDefinition<TPayloadSchema extends z.ZodTypeAny, TResult = void> {
  /** Unique job key used as Graphile task identifier. */
  readonly key: JobName;
  /** Optional explicit identifier used when reconciling known crontabs. */
  readonly identifier?: string;
  /** Cron expression executed in UTC. */
  readonly cron: string;
  /** Descriptive timezone used for observability purposes. */
  readonly timezone?: string;
  /** Human readable description. */
  readonly description?: string;
  /** Zod schema describing the payload shape. */
  readonly payloadSchema: TPayloadSchema;
  /** Invoked when the job executes. */
  readonly handler: (
    payload: z.infer<TPayloadSchema>,
    context: SchedulerHandlerContext
  ) => Promise<TResult>;
  /** Optional success hook fired after the handler resolves. */
  readonly onSuccess?: (result: TResult, context: SchedulerHandlerContext) => Promise<void>;
  /** Optional failure hook fired when the handler throws. */
  readonly onError?: (error: Error, context: SchedulerHandlerContext) => Promise<void>;
  /** Optional cron item options. */
  readonly options?: SchedulerOptions;
  /** Produce the payload used for cron-triggered executions. */
  readonly payloadFactory?: () => z.input<TPayloadSchema> | Promise<z.input<TPayloadSchema>>;
}

/**
 * Helper options for scheduling one-off executions.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ScheduleOnceOptions extends TaskSpec {}

/**
 * Shape of the scheduleOnce helper function.
 */
export type ScheduleOnceFn = <TPayloadSchema extends z.ZodTypeAny, TResult = void>(
  definition: ScheduledJobDefinition<TPayloadSchema, TResult>,
  payload: z.input<TPayloadSchema>,
  addJob: AddJobFunction,
  options?: ScheduleOnceOptions
) => Promise<void>;
