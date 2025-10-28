/**
 * @fileoverview Helper utilities for scheduling jobs.
 * @module core/scheduler/helpers
 */


import type { ScheduledJobDefinition, ScheduleOnceOptions } from './types';
import type { AddJobFunction } from 'graphile-worker';
import type { z } from 'zod';

/**
 * Schedule a one-off job leveraging the payload schema from the definition.
 */
export async function scheduleOnce<TPayloadSchema extends z.ZodTypeAny, TResult>(
  definition: ScheduledJobDefinition<TPayloadSchema, TResult>,
  payload: z.input<TPayloadSchema>,
  addJob: AddJobFunction,
  options: ScheduleOnceOptions = {}
): Promise<void> {
  const validatedPayload: unknown = definition.payloadSchema.parse(payload);
  await addJob(definition.key, validatedPayload, options);
}
