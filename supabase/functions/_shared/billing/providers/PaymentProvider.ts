export interface PaymentProvider {
  createCheckoutSession(params: {
    priceId: string;
    customerId?: string;
    userId: string;
    email?: string;
    mode: 'subscription' | 'payment';
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string }>;
  
  createCustomer(email: string, userId: string): Promise<{ id: string }>;
  
  constructWebhookEvent(payload: string, signature: string, secret: string): any;
}
