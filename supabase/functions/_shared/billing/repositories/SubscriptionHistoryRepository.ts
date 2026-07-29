import { supabaseAdmin } from '../../supabaseClient.ts';

export class SubscriptionHistoryRepository {
  static async logEvent(
    userId: string,
    planId: string | null,
    stripeSubscriptionId: string | null,
    status: string,
    eventType: string,
    metadata?: any
  ) {
    const { error } = await supabaseAdmin
      .from('subscription_history')
      .insert({
        user_id: userId,
        plan_id: planId,
        stripe_subscription_id: stripeSubscriptionId,
        status,
        event_type: eventType,
        metadata
      });
      
    if (error) throw error;
  }
}
