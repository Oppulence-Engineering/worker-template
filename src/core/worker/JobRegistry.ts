/**
 * @fileoverview Type-safe job registry for Graphile Worker
 * @module core/worker/JobRegistry
 */

import type { TaskList } from 'graphile-worker';
import type { Logger } from 'pino';
import type { z } from 'zod';

import type { IJob, JobName } from '../types';

type RegisteredJob = IJob<z.ZodTypeAny, unknown, Record<string, unknown>>;

/**
 * Job registry for managing and accessing all registered jobs
 *
 * @template TJobMap - Map of job names to job instances
 *
 * @example
 * ```typescript
 * const registry = new JobRegistry();
 * registry.register(new EmailJob());
 * registry.register(new DataProcessingJob());
 *
 * const taskList = registry.getTaskList();
 * const emailJob = registry.getJob('send-email' as JobName);
 * ```
 */
export class JobRegistry<TJobMap extends Record<string, IJob> = Record<string, IJob>> {
  /**
   * Map of job name to job instance
   */
  private readonly jobs = new Map<JobName, RegisteredJob>();

  /**
   * Logger instance
   */
  private logger?: Logger;

  /**
   * Set logger for registry
   */
  setLogger(logger: Logger): this {
    this.logger = logger;
    return this;
  }

  /**
   * Register a job
   *
   * @template TJob - Job type
   * @param job - Job instance to register
   * @throws {Error} If job with same name already registered
   */
  register<TJob extends RegisteredJob>(job: TJob): this {
    const jobName = job.jobName;

    if (this.jobs.has(jobName)) {
      throw new Error(`Job '${jobName}' is already registered`);
    }

    this.jobs.set(jobName, job);

    this.logger?.info({ jobName }, `Registered job: ${jobName}`);

    return this;
  }

  /**
   * Register multiple jobs at once
   *
   * @param jobs - Array of job instances
   */
  registerMany(jobs: RegisteredJob[]): this {
    for (const job of jobs) {
      this.register(job);
    }
    return this;
  }

  /**
   * Get a registered job by name
   *
   * @param name - Job name
   * @returns Job instance or undefined
   */
  getJob(name: JobName): RegisteredJob | undefined {
    return this.jobs.get(name);
  }

  /**
   * Check if a job is registered
   *
   * @param name - Job name
   * @returns Whether job is registered
   */
  hasJob(name: JobName): boolean {
    return this.jobs.has(name);
  }

  /**
   * Get all registered jobs
   *
   * @returns Array of all job instances
   */
  getAllJobs(): RegisteredJob[] {
    return Array.from(this.jobs.values());
  }

  /**
   * Get all registered job names
   *
   * @returns Array of job names
   */
  getJobNames(): JobName[] {
    return Array.from(this.jobs.keys());
  }

  /**
   * Get number of registered jobs
   */
  getCount(): number {
    return this.jobs.size;
  }

  /**
   * Get Graphile Worker task list
   *
   * @returns TaskList for Graphile Worker
   */
  getTaskList(): TaskList {
    const tasks: TaskList = {};

    for (const [name, job] of this.jobs) {
      tasks[name] = job.getTaskFunction();
    }

    this.logger?.info(
      { jobCount: this.jobs.size, jobs: Array.from(this.jobs.keys()) },
      'Created task list for Graphile Worker'
    );

    return tasks;
  }

  /**
   * Unregister a job
   *
   * @param name - Job name to unregister
   * @returns Whether job was unregistered
   */
  unregister(name: JobName): boolean {
    const removed = this.jobs.delete(name);

    if (removed) {
      this.logger?.info({ jobName: name }, `Unregistered job: ${name}`);
    }

    return removed;
  }

  /**
   * Clear all registered jobs
   */
  clear(): void {
    this.jobs.clear();
    this.logger?.info('Cleared all registered jobs');
  }

  /**
   * Get registry statistics
   */
  getStats(): {
    totalJobs: number;
    jobNames: string[];
  } {
    return {
      totalJobs: this.jobs.size,
      jobNames: Array.from(this.jobs.keys()),
    };
  }
}

/**
 * Create a job registry with pre-registered jobs
 *
 * @param jobs - Array of job instances to register
 * @param logger - Optional logger
 * @returns Configured job registry
 */
export function createJobRegistry(jobs: RegisteredJob[], logger?: Logger): JobRegistry {
  const registry = new JobRegistry();

  if (logger) {
    registry.setLogger(logger);
  }

  registry.registerMany(jobs);

  return registry;
}
