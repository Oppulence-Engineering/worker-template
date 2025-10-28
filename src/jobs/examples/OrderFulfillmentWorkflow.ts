import { z } from 'zod';

import { WorkflowJob } from '../../core/workflow';

import type { WorkflowMetrics } from '../../core/instrumentation/metrics';
import type { JobConfig, JobName } from '../../core/types';

const OrderPayloadSchema = z.object({
  orderId: z.string().min(1),
  amount: z.number().nonnegative(),
});

type OrderSharedState = {
  auditTrail: string[];
  charged: boolean;
};

export class OrderFulfillmentWorkflow extends WorkflowJob<
  typeof OrderPayloadSchema,
  void,
  OrderSharedState
> {
  public readonly jobName = 'order-fulfillment' as JobName;
  public readonly schema = OrderPayloadSchema;
  public readonly defaultConfig: Partial<JobConfig> = {
    maxAttempts: 1,
    priority: 0,
  };

  protected readonly steps = [
    {
      id: 'reserve-inventory',
      description: 'reserve items for order',
      execute: async ({
        sharedState,
        payload,
      }: {
        sharedState: OrderSharedState;
        payload: z.infer<typeof OrderPayloadSchema>;
      }) => {
        sharedState.auditTrail.push(`inventory reserved for ${payload.orderId}`);
      },
      compensate: async ({ sharedState }: { sharedState: OrderSharedState }) => {
        sharedState.auditTrail.push('inventory released');
      },
    },
    {
      id: 'capture-payment',
      description: 'charge customer payment method',
      dependsOn: ['reserve-inventory'],
      execute: async ({
        sharedState,
        payload,
      }: {
        sharedState: OrderSharedState;
        payload: z.infer<typeof OrderPayloadSchema>;
      }) => {
        sharedState.auditTrail.push(`payment captured: ${payload.amount}`);
        sharedState.charged = true;
      },
      compensate: async ({ sharedState }: { sharedState: OrderSharedState }) => {
        if (sharedState.charged) {
          sharedState.auditTrail.push('payment refunded');
          sharedState.charged = false;
        }
      },
    },
    {
      id: 'dispatch-notification',
      description: 'notify order dispatch',
      dependsOn: ['capture-payment'],
      execute: async ({
        sharedState,
        payload,
      }: {
        sharedState: OrderSharedState;
        payload: z.infer<typeof OrderPayloadSchema>;
      }) => {
        sharedState.auditTrail.push(`order ${payload.orderId} fulfilled`);
      },
    },
  ];

  constructor(workflowMetrics: WorkflowMetrics) {
    super({
      metrics: workflowMetrics,
      sharedStateFactory: () => ({ auditTrail: [], charged: false }),
    });
  }
}
