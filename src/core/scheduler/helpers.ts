/**
 * @fileoverview Helper utilities for scheduling jobs.
 * @module core/scheduler/helpers
 */

import type { AddJobFunction } from 'graphile-worker';
import { z } from 'zod';

import type { ScheduledJobDefinition, ScheduleOnceOptions } from './types';

/**
 * Schedule a one-off job leveraging the payload schema from the definition.
 */
export async function scheduleOnce<TPayloadSchema extends z.ZodTypeAny, TResult>(
  definition: ScheduledJobDefinition<TPayloadSchema, TResult>,
  payload: z.input<TPayloadSchema>,
  addJob: AddJobFunction,
  options: ScheduleOnceOptions = {}
): Promise<void> {
  const validatedPayload = definition.payloadSchema.parse(payload);
  await addJob(definition.key, validatedPayload, options);
}
