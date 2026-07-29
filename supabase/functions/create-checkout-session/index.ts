import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { StripeProvider } from "../_shared/billing/providers/StripeProvider.ts";
import { supabaseAdmin } from "../_shared/supabaseClient.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error("Missing auth header");
    
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''));
    if (userError || !user) throw new Error("Unauthorized");

    const { planId, packageId, successUrl, cancelUrl } = await req.json();
    if (!planId && !packageId) throw new Error("Must provide planId or packageId");

    let stripePriceId = "";
    let mode: "subscription" | "payment" = "subscription";

    // Fetch Price ID from Database
    if (planId) {
      const { data } = await supabaseAdmin.from('plans').select('stripe_price_id').eq('id', planId).single();
      if (!data?.stripe_price_id) throw new Error("Plan not found or missing price ID");
      stripePriceId = data.stripe_price_id;
      mode = "subscription";
    } else if (packageId) {
      const { data } = await supabaseAdmin.from('credit_packages').select('stripe_price_id').eq('id', packageId).single();
      if (!data?.stripe_price_id) throw new Error("Package not found or missing price ID");
      stripePriceId = data.stripe_price_id;
      mode = "payment";
    }

    // Fetch or create Stripe Customer
    const { data: profile } = await supabaseAdmin.from('profiles').select('stripe_customer_id').eq('id', user.id).single();
    
    const stripeProvider = new StripeProvider(Deno.env.get("STRIPE_SECRET_KEY") ?? "");
    let customerId = profile?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripeProvider.createCustomer(user.email ?? '', user.id);
      customerId = customer.id;
      await supabaseAdmin.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id);
    }

    // Create Session
    const session = await stripeProvider.createCheckoutSession({
      priceId: stripePriceId,
      customerId,
      userId: user.id,
      mode,
      successUrl: successUrl || `${req.headers.get("origin")}/dashboard?payment=success`,
      cancelUrl: cancelUrl || `${req.headers.get("origin")}/pricing?payment=cancelled`
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("Error creating checkout session:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
