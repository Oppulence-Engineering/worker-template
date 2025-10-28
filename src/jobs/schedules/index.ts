/**
 * @fileoverview Entry point for scheduled job definitions.
 * @module jobs/schedules
 */

import type { z } from 'zod';

import { NightlyReportJobDefinition } from './nightlyReport';

import type { ScheduledJobDefinition } from '../../core/scheduler';

export const ScheduledJobDefinitions = [
  NightlyReportJobDefinition as unknown as ScheduledJobDefinition<z.ZodTypeAny, unknown>,
] as const;

export type { ScheduledJobDefinition } from '../../core/scheduler';
