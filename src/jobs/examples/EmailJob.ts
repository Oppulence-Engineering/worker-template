/**
 * @fileoverview Example email job demonstrating RetryableJob usage
 * @module jobs/examples/EmailJob
 */

import { z } from 'zod';

import { ExponentialRetryJob } from '../base/RetryableJob';
import type { JobConfig, JobContext, JobName, QueueName } from '../../core/types';

const EMAIL_QUEUE: QueueName = 'email' as QueueName;

/**
 * Email payload schema
 */
export const EmailPayloadSchema = z.object({
  to: z.string().email().describe('Recipient email address'),
  subject: z.string().min(1).max(200).describe('Email subject'),
  body: z.string().min(1).describe('Email body (HTML or plain text)'),
  from: z.string().email().optional().describe('Sender email (optional)'),
  replyTo: z.string().email().optional().describe('Reply-to address (optional)'),
  cc: z.array(z.string().email()).optional().describe('CC recipients'),
  bcc: z.array(z.string().email()).optional().describe('BCC recipients'),
  attachments: z
    .array(
      z.object({
        filename: z.string(),
        content: z.string(),
        contentType: z.string().optional(),
      })
    )
    .optional()
    .describe('Email attachments'),
});

/**
 * Example Email Job with retry logic
 *
 * This job demonstrates:
 * - Using ExponentialRetryJob for automatic retry with backoff
 * - Zod schema validation for type-safe payloads
 * - Proper error handling and logging
 * - Custom retry logic based on error types
 */
export class EmailJob extends ExponentialRetryJob<typeof EmailPayloadSchema, void> {
  public readonly jobName = 'send-email' as JobName;
  public readonly schema = EmailPayloadSchema;
  public readonly defaultConfig: Partial<JobConfig> = {
    maxAttempts: 5,
    priority: 0,
    queue: EMAIL_QUEUE,
  };

  // Override retry strategy config for this job
  protected override readonly strategyConfig = {
    baseDelay: 2000, // 2 seconds
    maxDelay: 300000, // 5 minutes
    factor: 3,
    jitter: true,
  };

  /**
   * Send email implementation
   */
  async execute(payload: z.infer<typeof EmailPayloadSchema>, context: JobContext): Promise<void> {
    context.logger.info('Sending email', {
      to: payload.to,
      subject: payload.subject,
      hasAttachments: !!payload.attachments?.length,
    });

    // Simulate email sending
    await this.sendEmailViaProvider(payload, context);

    context.logger.info('Email sent successfully', { to: payload.to });
  }

  /**
   * Simulate sending email via email provider (e.g., SendGrid, AWS SES)
   * Replace this with actual email provider integration
   */
  private async sendEmailViaProvider(
    payload: z.infer<typeof EmailPayloadSchema>,
    context: JobContext
  ): Promise<void> {
    // Example: Integrate with your email provider
    // const provider = new EmailProvider(config);
    // await provider.send({
    //   to: payload.to,
    //   from: payload.from || process.env.SMTP_FROM,
    //   subject: payload.subject,
    //   html: payload.body,
    //   ...payload,
    // });

    // For now, just log the email
    context.logger.debug('Email payload', { payload });

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Simulate random failures for testing retry logic (remove in production)
    if (Math.random() < 0.1 && context.attemptNumber === 1) {
      throw new Error('Simulated transient email provider error');
    }
  }

  /**
   * Override to determine if error is retryable
   * Don't retry validation or authentication errors
   */
  protected override isRetryableError(error: Error): boolean {
    const nonRetryableErrors = [
      'ValidationError',
      'AuthenticationError',
      'InvalidEmailError',
      'RateLimitError', // Handle rate limits differently
    ];

    return !nonRetryableErrors.some((type) => error.name === type || error.message.includes(type));
  }

  protected override getFeatureFlagKey(): string | undefined {
    return 'jobs.send_email.enabled';
  }

  /**
   * Custom error handling for email-specific errors
   */
  override async onError(error: Error, context: JobContext): Promise<void> {
    await super.onError(error, context);

    // Send alert for critical email failures
    if (context.attemptNumber === context.maxAttempts) {
      context.logger.error(
        'Email delivery failed after all retries - requires manual intervention',
        {
          to: 'payload.to', // Would need to store payload in context
          error: error.message,
        }
      );
      // TODO: Send alert to monitoring system
    }
  }
}
