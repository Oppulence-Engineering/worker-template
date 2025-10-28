/**
 * @fileoverview Base workflow job abstraction built atop Graphile Worker jobs.
 * @module core/workflow/WorkflowJob
 *
 * Note: Some methods are intentionally async to allow subclasses to use await.
 */

/* eslint-disable @typescript-eslint/require-await */

import { randomUUID } from 'node:crypto';


import { BaseJob } from '../abstractions/BaseJob';

import type { WorkflowMetrics } from '../instrumentation/metrics';
import type { JobContext } from '../types';
import type {
  WorkflowCompensationArgs,
  WorkflowEvent,
  WorkflowJobOptions,
  WorkflowObserver,
  WorkflowResult,
  WorkflowStepDefinition,
  WorkflowStepSnapshot,
  WorkflowStepStatus,
} from './types';
import type { z } from 'zod';

interface WorkflowRuntimeState<TShared extends Record<string, unknown>> {
  readonly workflowId: string;
  readonly sharedState: TShared;
  readonly stepResults: Map<string, unknown>;
  readonly stepSnapshots: WorkflowStepSnapshot[];
  readonly startedAt: number;
}

type WorkflowMetricsAdapter = WorkflowJobOptions<Record<string, unknown>>['metrics'];

/**
 * Base class enabling multi-step workflow orchestration with compensation.
 */
export abstract class WorkflowJob<
  TPayloadSchema extends z.ZodTypeAny,
  TResult = void,
  TSharedState extends Record<string, unknown> = Record<string, unknown>
> extends BaseJob<TPayloadSchema, WorkflowResult<TResult, TSharedState>> {
  protected abstract readonly steps: WorkflowStepDefinition<
    z.infer<TPayloadSchema>,
    TSharedState,
    unknown
  >[];

  protected readonly workflowObservers: WorkflowObserver<TResult, TSharedState>[];
  private readonly metrics?: WorkflowMetrics | WorkflowMetricsAdapter;
  private readonly sharedStateFactory: () => TSharedState;
  private stepsValidated = false;

  constructor(options: WorkflowJobOptions<TSharedState> = {}) {
    super();
    this.workflowObservers = options.observers?.slice() ?? [];
    this.metrics = options.metrics as WorkflowMetrics | WorkflowMetricsAdapter | undefined;
    this.sharedStateFactory = options.sharedStateFactory ?? (() => ({}) as TSharedState);
  }

  /**
   * Execute workflow steps and return aggregated result.
   */
  override async execute(
    payload: z.infer<TPayloadSchema>,
    context: JobContext<Record<string, unknown>>
  ): Promise<WorkflowResult<TResult, TSharedState>> {
    if (!this.stepsValidated) {
      this.validateSteps();
      this.stepsValidated = true;
    }

    const runtime = this.createRuntimeState();
    await this.emitEvent('workflow:start', runtime, context);

    try {
      for (const step of this.steps) {
        await this.executeStep(step, payload, context, runtime);
      }

      const completedAt = new Date();
      const durationMs = completedAt.getTime() - runtime.startedAt;
      const result = await this.onWorkflowCompleted(payload, context, runtime);

      const success: WorkflowResult<TResult, TSharedState> = {
        workflowId: runtime.workflowId,
        status: 'success',
        completedAt,
        durationMs,
        result,
        sharedState: runtime.sharedState,
        steps: runtime.stepSnapshots,
      };

      this.recordMetricsCompletion(context.jobName, durationMs, 'success');
      await this.emitEvent('workflow:completed', runtime, context, success);

      return success;
    } catch (error) {
      const failedAt = new Date();
      const durationMs = failedAt.getTime() - runtime.startedAt;
      const failure: WorkflowResult<TResult, TSharedState> = {
        workflowId: runtime.workflowId,
        status: 'failure',
        failedAt,
        durationMs,
        error: error as Error,
        sharedState: runtime.sharedState,
        steps: runtime.stepSnapshots,
      };

      this.recordMetricsCompletion(context.jobName, durationMs, 'failure');
      await this.emitEvent('workflow:failed', runtime, context, failure, error as Error);
      throw error;
    }
  }

  /**
   * Hook invoked after all steps complete successfully.
   * Default behaviour returns the result of the last executed step, if any.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected async onWorkflowCompleted(
    _payload: z.infer<TPayloadSchema>,
    _context: JobContext<Record<string, unknown>>,
    runtime: WorkflowRuntimeState<TSharedState>
  ): Promise<TResult> {
    const lastResult = runtime.stepResults.get(this.steps.at(-1)?.id ?? '') as TResult | undefined;
    return (lastResult ?? (undefined as TResult));
  }

  /**
   * Validate workflow definitions on construction.
   */
  private validateSteps(): void {
    const ids = new Set<string>();
    for (const step of this.steps) {
      if (ids.has(step.id)) {
        throw new Error(`Workflow step ids must be unique. Duplicate: ${step.id}`);
      }
      ids.add(step.id);

      if (step.dependsOn) {
        for (const dep of step.dependsOn) {
          if (!ids.has(dep)) {
            throw new Error(
              `Workflow step '${step.id}' depends on '${dep}' which has not been defined earlier. Ensure steps are ordered topologically.`
            );
          }
        }
      }
    }
  }

  private createRuntimeState(): WorkflowRuntimeState<TSharedState> {
    return {
      workflowId: randomUUID(),
      sharedState: this.sharedStateFactory(),
      stepResults: new Map<string, unknown>(),
      stepSnapshots: [],
      startedAt: Date.now(),
    };
  }

  private async executeStep(
    step: WorkflowStepDefinition<z.infer<TPayloadSchema>, TSharedState>,
    payload: z.infer<TPayloadSchema>,
    context: JobContext<Record<string, unknown>>,
    runtime: WorkflowRuntimeState<TSharedState>
  ): Promise<void> {
    this.ensureDependenciesSatisfied(step, runtime);

    const snapshot = this.createSnapshot(step.id, 'in_progress');
    runtime.stepSnapshots.push(snapshot);
    await this.emitEvent('step:start', runtime, context, undefined, undefined, step.id, snapshot);

    const start = Date.now();
    try {
      const output = await step.execute({
        payload,
        sharedState: runtime.sharedState,
        jobContext: context,
        stepResults: runtime.stepResults,
      });

      snapshot.status = 'completed';
      snapshot.completedAt = new Date();
      snapshot.durationMs = Date.now() - start;
      runtime.stepResults.set(step.id, output);
      this.recordStepMetric(context.jobName, step.id, 'success');
      await this.emitEvent('step:completed', runtime, context, undefined, undefined, step.id, snapshot);
    } catch (error) {
      snapshot.status = 'failed';
      snapshot.completedAt = new Date();
      snapshot.durationMs = Date.now() - start;
      snapshot.error = (error as Error).message;
      this.recordStepMetric(context.jobName, step.id, 'failure');
      await this.emitEvent('step:failed', runtime, context, undefined, error as Error, step.id, snapshot);

      await this.executeCompensation(step, payload, context, runtime, error as Error);
      throw error;
    }
  }

  private ensureDependenciesSatisfied(
    step: WorkflowStepDefinition<z.infer<TPayloadSchema>, TSharedState>,
    runtime: WorkflowRuntimeState<TSharedState>
  ): void {
    if (!step.dependsOn?.length) {
      return;
    }

    const completedStepIds = new Set(
      runtime.stepSnapshots.filter((s) => s.status === 'completed').map((s) => s.id)
    );

    for (const dep of step.dependsOn) {
      if (!completedStepIds.has(dep)) {
        throw new Error(
          `Workflow dependency violation: step '${step.id}' attempted before dependency '${dep}' completed.`
        );
      }
    }
  }

  private async executeCompensation(
    failedStep: WorkflowStepDefinition<z.infer<TPayloadSchema>, TSharedState>,
    payload: z.infer<TPayloadSchema>,
    context: JobContext<Record<string, unknown>>,
    runtime: WorkflowRuntimeState<TSharedState>,
    error: Error
  ): Promise<void> {
    const compensatableSteps = this.steps
      // eslint-disable-next-line @typescript-eslint/unbound-method
      .filter((step) => step.compensate)
      .filter((step) =>
        runtime.stepSnapshots.some(
          (snapshot) => snapshot.id === step.id && snapshot.status === 'completed'
        )
      )
      .reverse();

    for (const step of compensatableSteps) {
      try {
        await step.compensate?.({
          payload,
          sharedState: runtime.sharedState,
          jobContext: context,
          stepResults: runtime.stepResults,
          reason: error,
          failedStepId: failedStep.id,
        } as WorkflowCompensationArgs<z.infer<TPayloadSchema>, TSharedState>);

        this.recordCompensationMetric(context.jobName, step.id);
        await this.updateSnapshotStatus(runtime, step.id, 'compensated');
        await this.emitEvent('step:compensated', runtime, context, undefined, error, step.id);
      } catch (compensationError) {
        await this.emitEvent(
          'step:failed',
          runtime,
          context,
          undefined,
          compensationError as Error,
          step.id
        );
        throw compensationError;
      }
    }
  }

  private async emitEvent(
    type: WorkflowEvent<
      TResult,
      TSharedState
    >['type'],
    runtime: WorkflowRuntimeState<TSharedState>,
    context: JobContext<Record<string, unknown>>,
    result?: WorkflowResult<TResult, TSharedState>,
    error?: Error,
    stepId?: string,
    snapshot?: WorkflowStepSnapshot
  ): Promise<void> {
    if (this.workflowObservers.length === 0) {
      return;
    }

    const event: WorkflowEvent<TResult, TSharedState> = {
      type,
      workflowId: runtime.workflowId,
      jobContext: context,
      ...(stepId !== undefined ? { stepId } : {}),
      ...(error !== undefined ? { error } : {}),
      ...(typeof result !== 'undefined' ? { result } : {}),
      ...(snapshot !== undefined ? { snapshot } : {}),
    };

    await Promise.all(
      this.workflowObservers.map(async (observer) => observer.onEvent?.(event))
    );
  }

  private createSnapshot(stepId: string, status: WorkflowStepStatus): WorkflowStepSnapshot {
    return {
      id: stepId,
      status,
      startedAt: new Date(),
    };
  }

  private async updateSnapshotStatus(
    runtime: WorkflowRuntimeState<TSharedState>,
    stepId: string,
    status: WorkflowStepStatus
  ): Promise<void> {
    const snapshot = runtime.stepSnapshots.find((s) => s.id === stepId);
    if (snapshot) {
      snapshot.status = status;
      snapshot.completedAt = new Date();
    }
  }

  private recordStepMetric(jobName: string, stepId: string, outcome: 'success' | 'failure'): void {
    if (this.metrics && 'recordStep' in this.metrics) {
      this.metrics.recordStep(jobName, stepId, outcome);
    }
  }

  private recordCompensationMetric(jobName: string, stepId: string): void {
    if (this.metrics && 'recordCompensation' in this.metrics) {
      this.metrics.recordCompensation(jobName, stepId);
    }
  }

  private recordMetricsCompletion(
    jobName: string,
    durationMs: number,
    outcome: 'success' | 'failure'
  ): void {
    if (this.metrics && 'recordWorkflowCompletion' in this.metrics) {
      this.metrics.recordWorkflowCompletion(jobName, durationMs, outcome);
    }
  }
}
