import type { FeatureFlags } from '../config/schema';
import type { JobContext } from '../types';

export interface FeatureFlagEvaluationContext {
  readonly jobName: string;
  readonly payload: unknown;
  readonly jobContext: JobContext<Record<string, unknown>>;
}

export interface FeatureFlagProvider {
  evaluate(flagKey: string, ctx: FeatureFlagEvaluationContext): Promise<boolean>;
  close?(): Promise<void>;
}

export type FeatureFlagProviderFactory = (config: FeatureFlags) => FeatureFlagProvider;
