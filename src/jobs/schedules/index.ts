/**
 * @fileoverview Entry point for scheduled job definitions.
 * @module jobs/schedules
 */


import { NightlyReportJobDefinition } from './nightlyReport';

import type { ScheduledJobDefinition } from '../../core/scheduler';
import type { z } from 'zod';

export const ScheduledJobDefinitions = [
  NightlyReportJobDefinition as unknown as ScheduledJobDefinition<z.ZodTypeAny, unknown>,
] as const;

export type { ScheduledJobDefinition } from '../../core/scheduler';
