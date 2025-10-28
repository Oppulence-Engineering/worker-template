import { describe, it, expect, mock } from 'bun:test';
import { z } from 'zod';

import { FeatureFlagService } from '../../src/core/featureFlags';
import { FeatureFlagsSchema } from '../../src/core/config/schema';
import { BaseJob } from '../../src/core/abstractions/BaseJob';
import type { JobContext } from '../../src/core/types';

const PayloadSchema = z.object({ value: z.string() });

class FlaggedJob extends BaseJob<typeof PayloadSchema> {
  public readonly jobName = 'flagged-job' as any;
  public readonly schema = PayloadSchema;
  public readonly defaultConfig = {};

  public beforeExecute = mock(async () => {});
  public execute = mock(async () => {});

  protected override getFeatureFlagKey(): string | undefined {
    return 'jobs.flagged.enabled';
  }
}

const helpers = {
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    child: () => helpers.logger,
  },
  job: {
    id: '1',
    attempts: 1,
    max_attempts: 3,
    created_at: new Date().toISOString(),
    task_identifier: 'flagged-job',
  },
} as unknown as Parameters<ReturnType<FlaggedJob['getTaskFunction']>>[1];

describe('unit: Feature Flags', () => {
  it('executes job when flag enabled', async () => {
    const job = new FlaggedJob();
    job.setFeatureFlagService(
      new FeatureFlagService(
        FeatureFlagsSchema.parse({ provider: 'none', staticFlags: { 'jobs.flagged.enabled': true } })
      )
    );

    const task = job.getTaskFunction();
    await task({ value: 'ok' }, helpers);

    expect(job.beforeExecute).toHaveBeenCalled();
    expect(job.execute).toHaveBeenCalled();
  });

  it('skips execution when flag disabled', async () => {
    const job = new FlaggedJob();
    job.setFeatureFlagService(
      new FeatureFlagService(
        FeatureFlagsSchema.parse({ provider: 'none', staticFlags: { 'jobs.flagged.enabled': false } })
      )
    );

    const task = job.getTaskFunction();
    await task({ value: 'skip' }, helpers);

    expect(job.beforeExecute).not.toHaveBeenCalled();
    expect(job.execute).not.toHaveBeenCalled();
  });
});
