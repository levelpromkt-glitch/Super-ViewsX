import { supabaseAdmin } from '../../supabaseClient.ts';

export class PlansRepository {
  static async getPlanByStripePriceId(priceId: string) {
    const { data: plan, error } = await supabaseAdmin
      .from('plans')
      .select('*')
      .eq('stripe_price_id', priceId)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return plan;
  }

  static async getCreditPackageByStripePriceId(priceId: string) {
    const { data: pkg, error } = await supabaseAdmin
      .from('credit_packages')
      .select('*')
      .eq('stripe_price_id', priceId)
      .single();
      
    if (error && error.code !== 'PGRST116') throw error;
    return pkg;
  }
}
