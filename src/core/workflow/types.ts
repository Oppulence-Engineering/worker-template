/**
 * @fileoverview Workflow orchestration type definitions.
 * @module core/workflow/types
 */

import type { JobContext } from '../types';

/**
 * Status of an individual workflow step.
 */
export type WorkflowStepStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'compensated';

/**
 * Event types emitted during workflow execution.
 */
export type WorkflowEventType =
  | 'workflow:start'
  | 'workflow:completed'
  | 'workflow:failed'
  | 'step:start'
  | 'step:completed'
  | 'step:failed'
  | 'step:compensated';

/**
 * Runtime snapshot of a workflow step.
 */
export interface WorkflowStepSnapshot {
  readonly id: string;
  status: WorkflowStepStatus;
  readonly startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
  error?: string;
}

/**
 * Aggregated workflow execution result.
 */
export interface WorkflowExecutionResult<TResult, TSharedState extends Record<string, unknown>> {
  readonly workflowId: string;
  readonly status: 'success';
  readonly completedAt: Date;
  readonly durationMs: number;
  readonly result: TResult;
  readonly sharedState: TSharedState;
  readonly steps: WorkflowStepSnapshot[];
}

/**
 * Workflow run that failed.
 */
export interface WorkflowFailureResult<TSharedState extends Record<string, unknown>> {
  readonly workflowId: string;
  readonly status: 'failure';
  readonly failedAt: Date;
  readonly durationMs: number;
  readonly error: Error;
  readonly sharedState: TSharedState;
  readonly steps: WorkflowStepSnapshot[];
}

export type WorkflowResult<TResult, TSharedState extends Record<string, unknown>> =
  | WorkflowExecutionResult<TResult, TSharedState>
  | WorkflowFailureResult<TSharedState>;

/**
 * Arguments passed to each workflow step on execution.
 */
export interface WorkflowStepArgs<
  TPayload,
  TSharedState extends Record<string, unknown>
> {
  readonly payload: TPayload;
  readonly sharedState: TSharedState;
  readonly jobContext: JobContext<Record<string, unknown>>;
  readonly stepResults: ReadonlyMap<string, unknown>;
}

/**
 * Arguments passed to compensation handlers.
 */
export interface WorkflowCompensationArgs<
  TPayload,
  TSharedState extends Record<string, unknown>
> extends WorkflowStepArgs<TPayload, TSharedState> {
  readonly reason: Error;
  readonly failedStepId: string;
}

/**
 * Workflow step definition.
 */
export interface WorkflowStepDefinition<
  TPayload,
  TSharedState extends Record<string, unknown>,
  TResult = unknown
> {
  readonly id: string;
  readonly description?: string;
  readonly dependsOn?: string[];
  execute(args: WorkflowStepArgs<TPayload, TSharedState>): Promise<TResult>;
  compensate?(
    args: WorkflowCompensationArgs<TPayload, TSharedState>
  ): Promise<void>;
}

/**
 * Workflow observer event payload.
 */
export interface WorkflowEvent<
  TResult,
  TSharedState extends Record<string, unknown>
> {
  readonly type: WorkflowEventType;
  readonly workflowId: string;
  readonly jobContext: JobContext<Record<string, unknown>>;
  readonly stepId?: string;
  readonly error?: Error;
  readonly snapshot?: WorkflowStepSnapshot;
  readonly result?: WorkflowResult<TResult, TSharedState>;
}

/**
 * Observer interface for workflow execution.
 */
export interface WorkflowObserver<
  TResult,
  TSharedState extends Record<string, unknown>
> {
  onEvent?(event: WorkflowEvent<TResult, TSharedState>): void | Promise<void>;
}

/**
 * Options to customise workflow job execution.
 */
export interface WorkflowJobOptions<
  TSharedState extends Record<string, unknown>
> {
  readonly observers?: WorkflowObserver<unknown, TSharedState>[];
  readonly metrics?: {
    recordWorkflowCompletion: (jobName: string, durationMs: number, outcome: 'success' | 'failure') => void;
    recordStep: (jobName: string, stepId: string, outcome: 'success' | 'failure') => void;
    recordCompensation: (jobName: string, stepId: string) => void;
  };
  readonly sharedStateFactory?: () => TSharedState;
}
