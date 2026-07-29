import { supabaseAdmin } from '../../supabaseClient.ts';

export class CreditTransactionsRepository {
  static async addTransaction(
    userId: string, 
    amount: number, 
    transactionType: string, 
    metadata?: any
  ) {
    const { error } = await supabaseAdmin
      .from('credit_transactions')
      .insert({
        user_id: userId,
        amount,
        transaction_type: transactionType,
        metadata
      });
      
    if (error) throw error;
  }
}
