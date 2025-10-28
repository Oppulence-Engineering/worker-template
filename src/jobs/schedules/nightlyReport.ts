/**
 * @fileoverview Scheduled nightly report job definition.
 * @module jobs/schedules/nightlyReport
 *
 * Note: Some methods are intentionally async for consistency with the interface.
 */

/* eslint-disable @typescript-eslint/require-await */

import { z } from 'zod';

import type { ScheduledJobDefinition, SchedulerHandlerContext } from '../../core/scheduler';
import type { JobName, QueueName } from '../../core/types';

type SchedulerLogger = SchedulerHandlerContext['logger'];

const ReportSectionSchema = z.object({
  name: z.string().min(1),
  success: z.boolean(),
  durationMs: z.number().int().min(0),
  notes: z.string().optional(),
});

const ReportSummarySchema = z.object({
  reportDate: z.string().datetime({ offset: true }),
  generatedAt: z.date(),
  sections: z.array(ReportSectionSchema),
  stats: z.object({
    processed: z.number().int().min(0),
    failed: z.number().int().min(0),
  }),
});

type ReportSummary = z.infer<typeof ReportSummarySchema>;

const NightlyReportPayloadSchema = z.object({
  notifyEmails: z.array(z.string().email()).default([]),
  channels: z.array(z.enum(['email', 'slack'])).default(['email']),
});

/**
 * Scheduled job definition for generating and distributing the nightly report.
 */
const REPORTING_QUEUE: QueueName = 'reporting' as QueueName;

export const NightlyReportJobDefinition: ScheduledJobDefinition<
  typeof NightlyReportPayloadSchema,
  ReportSummary
> = {
  key: 'nightly-report' as JobName,
  identifier: 'nightly-report',
  cron: '0 2 * * *',
  timezone: 'America/New_York',
  description: 'Generates an operational summary and sends it to configured stakeholders.',
  payloadSchema: NightlyReportPayloadSchema,
  payloadFactory: () => ({
    notifyEmails: [],
    channels: ['email'],
  }),
  options: {
    backfillPeriod: 0,
    maxAttempts: 3,
    priority: 0,
    queueName: REPORTING_QUEUE,
  },
  handler: async (payload, context) => {
    const reportDateIso = context.scheduledAt.toISOString();
    context.logger.info('Starting nightly report generation', {
      schedule: context.jobName,
      reportDate: reportDateIso,
    });

    const report = await generateNightlyReport({
      reportDate: reportDateIso,
      notifyEmails: payload.notifyEmails,
    });

    await deliverReport({
      report,
      channels: payload.channels,
      logger: context.logger,
    });

    context.recordMetrics({
      records_processed_total: report.stats.processed,
      records_failed_total: report.stats.failed,
    });

    return report;
  },
  onSuccess: async (report, context) => {
    context.logger.info('Nightly report delivered', {
      schedule: context.jobName,
      reportDate: report.reportDate,
      sections: report.sections.length,
      processed: report.stats.processed,
      failed: report.stats.failed,
    });
  },
  onError: async (error, context) => {
    context.logger.error('Nightly report execution failed', {
      schedule: context.jobName,
      scheduledAt: context.scheduledAt.toISOString(),
      isBackfill: context.isBackfill,
      message: error.message,
    });
  },
};

async function generateNightlyReport(params: {
  reportDate: string;
  notifyEmails: string[];
}): Promise<ReportSummary> {
  // Placeholder for domain-specific aggregation.
  const sections: ReportSummary['sections'] = [
    {
      name: 'ingestion',
      success: true,
      durationMs: 4200,
      notes: 'All ingestion pipelines executed successfully.',
    },
    {
      name: 'settlements',
      success: true,
      durationMs: 2600,
    },
    {
      name: 'alerts',
      success: false,
      durationMs: 1800,
      notes: 'Two alerts require follow-up.',
    },
  ];

  const processed = sections.reduce((total, section) => total + (section.success ? 1 : 0), 0);
  const failed = sections.length - processed;

  return ReportSummarySchema.parse({
    reportDate: params.reportDate,
    generatedAt: new Date(),
    sections,
    stats: {
      processed,
      failed,
    },
  });
}

async function deliverReport(params: {
  report: ReportSummary;
  channels: string[];
  logger: SchedulerLogger;
}): Promise<void> {
  const { report, channels, logger } = params;
  const durationSeconds = Math.round((Date.now() - report.generatedAt.getTime()) / 1000);

  logger.info('Dispatching nightly report', {
    schedule: 'nightly-report',
    channels,
    durationSeconds,
    sections: report.sections.length,
  });

  await Promise.resolve();
}
