import { PaymentProvider } from './PaymentProvider.ts';
import Stripe from 'https://esm.sh/stripe@14.14.0';

export class StripeProvider implements PaymentProvider {
  private stripe: Stripe;

  constructor(secretKey: string) {
    this.stripe = new Stripe(secretKey, {
      apiVersion: '2023-10-16', // Deno fetch compatibility
      httpClient: Stripe.createFetchHttpClient(),
    });
  }

  async createCheckoutSession(params: {
    priceId: string;
    customerId?: string;
    userId: string;
    email?: string;
    mode: 'subscription' | 'payment';
    successUrl: string;
    cancelUrl: string;
    metadata?: Record<string, string>;
  }) {
    const session = await this.stripe.checkout.sessions.create({
      mode: params.mode,
      customer: params.customerId,
      customer_email: params.customerId ? undefined : params.email,
      line_items: [
        {
          price: params.priceId,
          quantity: 1,
        },
      ],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      client_reference_id: params.userId,
      metadata: {
        userId: params.userId,
        ...params.metadata
      },
    });

    return { url: session.url! };
  }

  async createCustomer(email: string, userId: string) {
    const customer = await this.stripe.customers.create({
      email,
      metadata: {
        userId,
      },
    });
    return { id: customer.id };
  }

  constructWebhookEvent(payload: string, signature: string, secret: string) {
    return this.stripe.webhooks.constructEvent(payload, signature, secret);
  }
}
