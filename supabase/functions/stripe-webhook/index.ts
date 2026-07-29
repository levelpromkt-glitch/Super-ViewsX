import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { StripeProvider } from "../_shared/billing/providers/StripeProvider.ts";
import { supabaseAdmin } from "../_shared/supabaseClient.ts";
import { BillingEventLogger } from "../_shared/billing/services/BillingEventLogger.ts";

const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const stripeProvider = new StripeProvider(stripeSecret);

serve(async (req) => {
  try {
    const signature = req.headers.get("stripe-signature");
    if (!signature) throw new Error("Missing stripe signature");

    const body = await req.text();
    const event = stripeProvider.constructWebhookEvent(body, signature, webhookSecret);

    // 1. Check Idempotency
    const { data: existingEvent } = await supabaseAdmin.from('stripe_events').select('id').eq('id', event.id).single();
    if (existingEvent) {
      return new Response("Event already processed", { status: 200 });
    }
    
    await supabaseAdmin.from('stripe_events').insert({ id: event.id, type: event.type });

    // 2. Process
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const userId = session.client_reference_id || session.metadata?.userId;
      if (!userId) return new Response("No user ID", { status: 200 });

      if (session.mode === 'payment') {
         if (session.metadata?.planId) {
             const planId = session.metadata.planId;
             const { data: plan } = await supabaseAdmin.from('plans').select('name').eq('id', planId).single();
             
             // Define credits based on plan name
             let credits = 0;
             if (plan?.name?.includes('Start')) credits = 55;
             if (plan?.name?.includes('PRO') || plan?.name?.includes('Pro')) credits = 120;
             
             const endDate = new Date();
             endDate.setDate(endDate.getDate() + 30); // 30 days access
             
             await supabaseAdmin.from('profiles').update({ 
               stripe_subscription_id: session.id, // using session id as sub id for one-time
               subscription_status: 'active',
               plan_id: planId,
               current_period_end: endDate.toISOString()
             }).eq('id', userId);

             if (credits > 0) {
               await BillingEventLogger.logSubscriptionRenewal(userId, planId, credits, 'onetime_' + session.id, session.id);
             }
         } else {
             // Adhoc credits
             const credits = session.amount_total === 1490 ? 15 : session.amount_total === 2497 ? 25 : session.amount_total === 3990 ? 50 : 0; 
             if (credits > 0) {
               await BillingEventLogger.logAdhocPurchase(userId, credits, session.payment_intent as string);
             }
         }
      } else if (session.mode === 'subscription') {
         // Link subscription to user (Legacy)
         const { data: plan } = await supabaseAdmin.from('plans').select('id').eq('stripe_price_id', session.line_items?.data[0]?.price?.id || '').single();
         if (plan) {
           await supabaseAdmin.from('profiles').update({ 
             stripe_subscription_id: session.subscription,
             subscription_status: 'active',
             plan_id: plan.id
           }).eq('id', userId);
         }
      }
    } else if (event.type === 'invoice.paid') {
       const invoice = event.data.object;
       const customerId = invoice.customer as string;
       const { data: profile } = await supabaseAdmin.from('profiles').select('id, plan_id').eq('stripe_customer_id', customerId).single();
       
       if (profile && invoice.subscription) {
          const credits = invoice.amount_paid === 3790 ? 55 : invoice.amount_paid === 5997 ? 120 : 0;
          if (credits > 0) {
             await BillingEventLogger.logSubscriptionRenewal(profile.id, profile.plan_id, credits, invoice.subscription as string, invoice.id);
          }
       }
    } else if (event.type === 'customer.subscription.deleted') {
       const sub = event.data.object;
       const { data: profile } = await supabaseAdmin.from('profiles').select('id, plan_id').eq('stripe_subscription_id', sub.id).single();
       if (profile) {
          await supabaseAdmin.from('profiles').update({ subscription_status: 'canceled', plan_id: null }).eq('id', profile.id);
          await BillingEventLogger.logSubscriptionCanceled(profile.id, profile.plan_id, sub.id);
       }
    }

    return new Response("Webhook processed", { status: 200 });
  } catch (error: any) {
    console.error("Webhook error:", error);
    return new Response(error.message, { status: 400 });
  }
});
