/**
 * @fileoverview Deduplicated job enqueue helpers.
 * @module core/deduplication/helpers
 */

import type { AddJobFunction } from 'graphile-worker';

import type { DeduplicatedJobParams, DeduplicationStrategy } from './types';

const DEFAULT_MAX_KEY_LENGTH = 256;

const STRATEGY_TO_MODE: Record<DeduplicationStrategy, 'unsafe_dedupe' | 'replace' | 'preserve_run_at'> = {
  drop: 'unsafe_dedupe',
  replace: 'replace',
  preserve_run_at: 'preserve_run_at',
};

/**
 * Build a deduplication key using the provided configuration.
 */
export function buildDeduplicationKey<TPayload>(params: {
  jobName: string;
  payload: TPayload;
  namespace?: string;
  ttlMs?: number;
  keyExtractor: (payload: TPayload) => string;
  maxKeyLength?: number;
  now?: () => number;
}): string {
  const {
    jobName,
    payload,
    namespace,
    ttlMs,
    keyExtractor,
    maxKeyLength = DEFAULT_MAX_KEY_LENGTH,
    now = () => Date.now(),
  } = params;

  const baseKeyRaw = keyExtractor(payload);
  const sanitizedBase = sanitizeKeyPart(baseKeyRaw);
  const prefix = namespace ? sanitizeKeyPart(namespace) : sanitizeKeyPart(jobName);

  const parts = [prefix, sanitizedBase];

  if (ttlMs && ttlMs > 0) {
    const window = Math.floor(now() / ttlMs);
    parts.push(window.toString());
  }

  const fullKey = parts.join(':');

  if (fullKey.length <= maxKeyLength) {
    return fullKey;
  }

  const truncated = fullKey.slice(0, maxKeyLength);
  return truncated;
}

/**
 * Enqueue a deduplicated job, leveraging Graphile Worker's job_key support.
 */
export async function enqueueDeduplicatedJob<TPayload>(
  addJob: AddJobFunction,
  params: DeduplicatedJobParams<TPayload>
): Promise<void> {
  const { jobName, payload, taskSpec, deduplication, now } = params;
  const jobKey = buildDeduplicationKey({
    jobName,
    payload,
    namespace: deduplication.namespace,
    ttlMs: deduplication.ttlMs,
    keyExtractor: deduplication.key,
    maxKeyLength: deduplication.maxKeyLength,
    now,
  });

  const strategy = deduplication.strategy ?? 'drop';
  const jobKeyMode = STRATEGY_TO_MODE[strategy] ?? 'unsafe_dedupe';

  await addJob(jobName as any, payload as any, {
    ...taskSpec,
    jobKey,
    jobKeyMode,
  });
}

/**
 * Remove invalid characters and trim whitespace for key parts.
 */
function sanitizeKeyPart(value: string): string {
  return value.trim().replace(/[\s\n\r\t]+/g, '_');
}
