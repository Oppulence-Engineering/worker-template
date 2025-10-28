/**
 * @fileoverview Type definitions for job deduplication helpers.
 * @module core/deduplication/types
 */

import type { TaskSpec } from 'graphile-worker';

/**
 * Deduplication strategy.
 *
 * - `drop`: skip enqueuing duplicate jobs within the dedupe window.
 * - `replace`: replace the existing job payload/options when duplicates occur.
 * - `preserve_run_at`: update payload/options but keep the original scheduled `run_at`.
 */
export type DeduplicationStrategy = 'drop' | 'replace' | 'preserve_run_at';

/**
 * Deduplication configuration describing how to derive job keys.
 */
export interface DeduplicationConfig<TPayload> {
  /**
   * Derive a deterministic key from the payload.
   * Common approaches include hashing significant fields or using natural identifiers.
   */
  readonly key: (payload: TPayload) => string;
  /**
   * Optional namespace to prevent collisions between unrelated job families.
   * Defaults to the Graphile job name.
   */
  readonly namespace?: string;
  /**
   * Time window in milliseconds for deduplication.
   * When provided, keys are bucketed by the TTL window (e.g., 5-minute buckets).
   */
  readonly ttlMs?: number;
  /**
   * Strategy to apply when a duplicate job is detected.
   */
  readonly strategy?: DeduplicationStrategy;
  /**
   * Maximum length for generated job keys (defaults to 256 characters).
   */
  readonly maxKeyLength?: number;
}

/**
 * Parameters required to enqueue a deduplicated job.
 */
export interface DeduplicatedJobParams<TPayload> {
  readonly jobName: string;
  readonly payload: TPayload;
  readonly taskSpec?: TaskSpec;
  readonly deduplication: DeduplicationConfig<TPayload>;
  /**
   * Optional override for the current timestamp (primarily for testing).
   */
  readonly now?: () => number;
}
