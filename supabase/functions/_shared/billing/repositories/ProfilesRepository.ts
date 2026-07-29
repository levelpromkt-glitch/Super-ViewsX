import { supabaseAdmin } from '../../supabaseClient.ts';

export class ProfilesRepository {
  static async getProfileByStripeCustomerId(customerId: string) {
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('stripe_customer_id', customerId)
      .single();
      
    if (error && error.code !== 'PGRST116') throw error;
    return profile;
  }

  static async updateProfile(userId: string, updates: any) {
    const { error } = await supabaseAdmin
      .from('profiles')
      .update(updates)
      .eq('id', userId);
      
    if (error) throw error;
  }
}
