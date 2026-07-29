import { CreditTransactionsRepository } from '../repositories/CreditTransactionsRepository.ts';
import { SubscriptionHistoryRepository } from '../repositories/SubscriptionHistoryRepository.ts';

export class BillingEventLogger {
  static async logSubscriptionRenewal(userId: string, planId: string, credits: number, stripeSubId: string, invoiceId: string) {
    await CreditTransactionsRepository.addTransaction(userId, credits, 'subscription_renewal', { stripe_invoice_id: invoiceId });
    await SubscriptionHistoryRepository.logEvent(userId, planId, stripeSubId, 'active', 'renewed', { stripe_invoice_id: invoiceId });
  }
  
  static async logAdhocPurchase(userId: string, credits: number, invoiceId: string) {
    await CreditTransactionsRepository.addTransaction(userId, credits, 'adhoc_purchase', { stripe_invoice_id: invoiceId });
  }

  static async logSubscriptionCreated(userId: string, planId: string, stripeSubId: string, invoiceId: string) {
    // Initial credits are usually granted via the first invoice.paid event
    await SubscriptionHistoryRepository.logEvent(userId, planId, stripeSubId, 'active', 'created', { stripe_invoice_id: invoiceId });
  }

  static async logSubscriptionCanceled(userId: string, planId: string | null, stripeSubId: string) {
    await SubscriptionHistoryRepository.logEvent(userId, planId, stripeSubId, 'canceled', 'canceled');
  }
}
