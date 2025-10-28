/**
 * @fileoverview Unit tests for workflow job orchestration
 * @module tests/unit/workflow
 */

import { describe, it, expect, mock } from 'bun:test';
import { z } from 'zod';

import type { JobContext } from '../../src/core/types';
import type { WorkflowResult } from '../../src/core/workflow';
import { WorkflowJob } from '../../src/core/workflow';

const PayloadSchema = z.object({ initial: z.number() });

type SharedState = {
  history: string[];
  runningTotal: number;
};

const createJobContext = (): JobContext<Record<string, unknown>> => ({
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    child: () => createJobContext().logger,
  } as unknown as JobContext['logger'],
  correlationId: 'corr-1' as any,
  span: {
    setAttributes: () => {},
    setStatus: () => {},
    addEvent: () => {},
    recordException: () => {},
    end: () => {},
  } as any,
  attemptNumber: 1,
  maxAttempts: 3,
  jobId: 'job-1' as any,
  jobName: 'workflow-test' as any,
  createdAt: new Date(),
  startedAt: new Date(),
  metadata: {},
  helpers: {
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
      child: () => ({}) as any,
    },
  } as any,
});

describe('unit: WorkflowJob', () => {
  class SuccessfulWorkflowJob extends WorkflowJob<typeof PayloadSchema, number, SharedState> {
    protected readonly steps = [
      {
        id: 'step-1',
        description: 'add initial value',
        execute: async ({ payload, sharedState }) => {
          sharedState.history.push('step-1');
          sharedState.runningTotal += payload.initial;
          return sharedState.runningTotal;
        },
      },
      {
        id: 'step-2',
        dependsOn: ['step-1'],
        execute: async ({ sharedState }) => {
          sharedState.history.push('step-2');
          sharedState.runningTotal *= 2;
          return sharedState.runningTotal;
        },
      },
    ];

    protected override async onWorkflowCompleted(
      _payload: z.infer<typeof PayloadSchema>,
      _context: JobContext<Record<string, unknown>>,
      runtime: any
    ): Promise<number> {
      return runtime.sharedState.runningTotal;
    }
  }

  it('executes steps in order and returns final result', async () => {
    const metrics = {
      recordWorkflowCompletion: mock(() => {}),
      recordStep: mock(() => {}),
      recordCompensation: mock(() => {}),
    };

    const observers = [
      {
        onEvent: mock(() => {}),
      },
    ];

    const job = new SuccessfulWorkflowJob({
      metrics,
      observers,
      sharedStateFactory: () => ({ history: [], runningTotal: 0 }),
    });

    const result = (await job.execute({ initial: 5 }, createJobContext())) as WorkflowResult<
      number,
      SharedState
    >;

    expect(result.status).toBe('success');
    expect(result.result).toBe(10);
    expect(result.sharedState.history).toEqual(['step-1', 'step-2']);
    expect(metrics.recordWorkflowCompletion).toHaveBeenCalledWith('workflow-test', expect.any(Number), 'success');
    expect(metrics.recordStep).toHaveBeenCalledWith('workflow-test', 'step-2', 'success');
    expect(metrics.recordCompensation).not.toHaveBeenCalled();
    expect(observers[0].onEvent).toHaveBeenCalled();
  });

  class CompensationWorkflowJob extends WorkflowJob<typeof PayloadSchema, number, SharedState> {
    protected readonly steps = [
      {
        id: 'first',
        execute: async ({ sharedState, payload }) => {
          sharedState.history.push('first');
          sharedState.runningTotal += payload.initial;
        },
        compensate: async ({ sharedState }) => {
          sharedState.history.push('compensate-first');
          sharedState.runningTotal = 0;
        },
      },
      {
        id: 'failing-step',
        dependsOn: ['first'],
        execute: async () => {
          throw new Error('step failure');
        },
      },
    ];
  }

  it('executes compensation when a step fails', async () => {
    const metrics = {
      recordWorkflowCompletion: mock(() => {}),
      recordStep: mock(() => {}),
      recordCompensation: mock(() => {}),
    };

    const job = new CompensationWorkflowJob({
      metrics,
      sharedStateFactory: () => ({ history: [], runningTotal: 0 }),
    });

    await expect(job.execute({ initial: 3 }, createJobContext())).rejects.toThrow('step failure');
    expect(metrics.recordWorkflowCompletion).toHaveBeenCalledWith('workflow-test', expect.any(Number), 'failure');
    expect(metrics.recordCompensation).toHaveBeenCalledWith('workflow-test', 'first');
  });
});
