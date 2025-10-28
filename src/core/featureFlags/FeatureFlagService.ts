import { createStaticProvider } from './StaticProvider';

import type { FeatureFlags } from '../config/schema';
import type { JobContext } from '../types';
import type { FeatureFlagEvaluationContext, FeatureFlagProvider } from './types';

export class FeatureFlagService {
  private provider: FeatureFlagProvider;

  constructor(featureFlagConfig: FeatureFlags) {
    switch (featureFlagConfig.provider) {
      case 'none':
      default:
        this.provider = createStaticProvider(featureFlagConfig);
        break;
    }
  }

  async isEnabled(
    flagKey: string,
    jobName: string,
    payload: unknown,
    jobContext: JobContext<Record<string, unknown>>
  ): Promise<boolean> {
    const ctx: FeatureFlagEvaluationContext = {
      jobName,
      payload,
      jobContext,
    };

    return this.provider.evaluate(flagKey, ctx);
  }
}
