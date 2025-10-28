import type { FeatureFlagProvider, FeatureFlagProviderFactory } from './types';
import type { FeatureFlags } from '../config/schema';

export class StaticFeatureFlagProvider implements FeatureFlagProvider {
  constructor(private readonly flags: Record<string, boolean>) {}

  async evaluate(flagKey: string): Promise<boolean> {
    return this.flags[flagKey] ?? false;
  }
}

export const createStaticProvider: FeatureFlagProviderFactory = (config: FeatureFlags) =>
  new StaticFeatureFlagProvider(config.staticFlags ?? {});
