/**
 * @fileoverview Batch processing job for handling multiple items efficiently
 * @module jobs/base/BatchJob
 */


import { BaseJob } from '../../core/abstractions/BaseJob';

import type { JobContext } from '../../core/types';
import type { z } from 'zod';

/**
 * Batch processing result
 *
 * @template TItem - Item type
 * @template TResult - Individual result type
 */
export interface BatchResult<TItem, TResult> {
  /** Successfully processed items */
  successful: Array<{ item: TItem; result: TResult }>;
  /** Failed items with errors */
  failed: Array<{ item: TItem; error: Error }>;
  /** Total items processed */
  total: number;
  /** Number of successful items */
  successCount: number;
  /** Number of failed items */
  failureCount: number;
}

/**
 * Abstract batch job for processing arrays of items
 *
 * @template TPayload - Payload schema type (must contain items array)
 * @template TItem - Individual item type
 * @template TResult - Individual processing result type
 * @template TMetadata - Metadata type
 *
 * @example
 * ```typescript
 * const BatchEmailSchema = z.object({
 *   items: z.array(z.object({
 *     to: z.string().email(),
 *     subject: z.string(),
 *     body: z.string(),
 *   })),
 * });
 *
 * class BatchEmailJob extends BatchJob<
 *   typeof BatchEmailSchema,
 *   z.infer<typeof BatchEmailSchema>['items'][0],
 *   void
 * > {
 *   protected readonly schema = BatchEmailSchema;
 *   protected readonly jobName = 'batch-email' as JobName;
 *   protected readonly defaultConfig = { maxAttempts: 3 };
 *   protected readonly batchSize = 10;
 *   protected readonly errorStrategy = 'continue';
 *
 *   async processItem(item, context) {
 *     await this.sendEmail(item);
 *   }
 * }
 * ```
 */
export abstract class BatchJob<
  TPayload extends z.ZodType,
  TItem,
  TResult = void,
  TMetadata = Record<string, unknown>,
> extends BaseJob<TPayload, BatchResult<TItem, TResult>, TMetadata> {
  /**
   * Batch size for processing
   * Override to set custom batch size
   */
  protected readonly batchSize: number = 100;

  /**
   * Error handling strategy
   * - 'fail-fast': Stop processing on first error
   * - 'continue': Continue processing remaining items
   * - 'collect': Collect all errors and continue
   */
  protected readonly errorStrategy: 'fail-fast' | 'continue' | 'collect' = 'continue';

  /**
   * Maximum concurrent item processing
   */
  protected readonly maxConcurrency: number = 5;

  /**
   * Extract items array from payload
   * Must be implemented by subclasses
   *
   * @param payload - Validated payload
   * @returns Array of items to process
   */
  protected abstract extractItems(payload: z.infer<TPayload>): TItem[];

  /**
   * Process individual item
   * Must be implemented by subclasses
   *
   * @param item - Item to process
   * @param context - Job context
   * @returns Processing result
   */
  protected abstract processItem(item: TItem, context: JobContext<TMetadata>): Promise<TResult>;

  /**
   * Main execute method - processes items in batches
   */
  async execute(
    payload: z.infer<TPayload>,
    context: JobContext<TMetadata>
  ): Promise<BatchResult<TItem, TResult>> {
    const items = this.extractItems(payload);
    const total = items.length;

    context.logger.info('Starting batch processing', {
      totalItems: total,
      batchSize: this.batchSize,
    });

    context.span.setAttributes({
      'batch.total_items': total,
      'batch.batch_size': this.batchSize,
      'batch.error_strategy': this.errorStrategy,
    });

    const result: BatchResult<TItem, TResult> = {
      successful: [],
      failed: [],
      total,
      successCount: 0,
      failureCount: 0,
    };

    // Process items in batches
    for (let i = 0; i < items.length; i += this.batchSize) {
      const batch = items.slice(i, i + this.batchSize);
      const batchNumber = Math.floor(i / this.batchSize) + 1;
      const totalBatches = Math.ceil(total / this.batchSize);

      context.logger.info(`Processing batch ${batchNumber}/${totalBatches}`, {
        batchNumber,
        totalBatches,
        batchSize: batch.length,
      });

      try {
        await this.processBatch(batch, result, context);
      } catch (error) {
        if (this.errorStrategy === 'fail-fast') {
          throw error;
        }
      }

      // Update progress
      const progress = Math.round(((i + batch.length) / total) * 100);
      context.span.addEvent('batch.progress', {
        progress,
        processed: i + batch.length,
        total,
      });
    }

    // Log final results
    context.logger.info('Batch processing complete', {
      total,
      successful: result.successCount,
      failed: result.failureCount,
      successRate: (result.successCount / total) * 100,
    });

    context.span.setAttributes({
      'batch.success_count': result.successCount,
      'batch.failure_count': result.failureCount,
      'batch.success_rate': result.successCount / total,
    });

    return result;
  }

  /**
   * Process a single batch with concurrency control
   */
  private async processBatch(
    batch: TItem[],
    result: BatchResult<TItem, TResult>,
    context: JobContext<TMetadata>
  ): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const item of batch) {
      const promise = this.processItemSafe(item, result, context);
      promises.push(promise);

      // Control concurrency
      if (promises.length >= this.maxConcurrency) {
        await Promise.race(promises);
        void promises.splice(
          promises.findIndex((p) => p === promise),
          1
        );
      }
    }

    // Wait for remaining items
    await Promise.all(promises);
  }

  /**
   * Process item with error handling
   */
  private async processItemSafe(
    item: TItem,
    result: BatchResult<TItem, TResult>,
    context: JobContext<TMetadata>
  ): Promise<void> {
    try {
      const itemResult = await this.processItem(item, context);
      result.successful.push({ item, result: itemResult });
      result.successCount++;
    } catch (error) {
      const err = error as Error;

      result.failed.push({ item, error: err });
      result.failureCount++;

      context.logger.warn('Failed to process item', {
        item,
        error: err.message,
      });

      if (this.errorStrategy === 'fail-fast') {
        throw err;
      }
    }
  }

  /**
   * Hook called before batch processing starts
   */
  protected async beforeBatchProcessing(
    _items: TItem[],
    _context: JobContext<TMetadata>
  ): Promise<void> {
    // Override to add custom logic
  }

  /**
   * Hook called after batch processing completes
   */
  protected async afterBatchProcessing(
    _result: BatchResult<TItem, TResult>,
    _context: JobContext<TMetadata>
  ): Promise<void> {
    // Override to add custom logic
  }

  /**
   * Hook called when an item fails
   */
  protected async onItemError(
    _item: TItem,
    _error: Error,
    _context: JobContext<TMetadata>
  ): Promise<void> {
    // Override to add custom error handling
  }
}
