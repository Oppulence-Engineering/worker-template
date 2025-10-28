/**
 * @fileoverview Unit tests for deduplication helpers.
 * @module tests/unit/deduplication
 */

import { describe, it, expect, mock } from 'bun:test';

import { buildDeduplicationKey, enqueueDeduplicatedJob } from '../../src/core/deduplication';

describe('unit: Deduplication Helpers', () => {
  it('builds key with namespace and ttl window', () => {
    const key = buildDeduplicationKey({
      jobName: 'send-email',
      payload: { userId: '123' },
      namespace: 'notifications',
      ttlMs: 60_000,
      now: () => 1700000000000,
      keyExtractor: (payload) => `user-${payload.userId}`,
    } as any);

    expect(key).toBe('notifications:user-123:28333333');
  });

  it('truncates keys exceeding max length', () => {
    const key = buildDeduplicationKey({
      jobName: 'example',
      payload: { id: 'x'.repeat(300) },
      keyExtractor: (payload) => payload.id,
      maxKeyLength: 64,
    } as any);

    expect(key.length).toBe(64);
  });

  it('enqueues job with dedupe jobKey and strategy mapping', async () => {
    const addJob = mock(async (_jobName: string, _payload: unknown, spec?: Record<string, unknown>) => spec);

    const ttlMs = 300_000;
    const now = 1700000000000;

    await enqueueDeduplicatedJob(addJob as any, {
      jobName: 'process-report',
      payload: { reportId: 'abc' },
      deduplication: {
        key: (payload) => payload.reportId,
        ttlMs,
        strategy: 'replace',
      },
      taskSpec: { priority: 2 },
      now: () => now,
    });

    const expectedWindow = Math.floor(now / ttlMs);

    expect(addJob).toHaveBeenCalledWith('process-report', { reportId: 'abc' }, expect.objectContaining({
      jobKey: `process-report:abc:${expectedWindow}`,
      jobKeyMode: 'replace',
      priority: 2,
    }));
  });
});
