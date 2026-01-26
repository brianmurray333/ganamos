/**
 * Transaction entity seeder for mock data generation
 */

import type { ServiceRoleClient, SeedTransaction, SeedResult } from '../types';
import {
  MOCK_USER_ID,
  TRANSACTION_MEMOS,
  TRANSACTION_AMOUNTS,
  SEED_QUANTITIES,
} from '../constants';

/**
 * Generate realistic transaction seed data
 */
function generateTransactionData(): SeedTransaction[] {
  const transactions: SeedTransaction[] = [];
  const now = new Date();

  // Create mix of deposits and internal transactions
  // Transaction 0-3: Deposits (initial funding)
  // Transaction 4-6: Internal rewards (from fixing posts)
  for (let i = 0; i < SEED_QUANTITIES.TRANSACTIONS; i++) {
    const isDeposit = i < 4;
    const type = isDeposit ? 'deposit' : 'internal';
    
    // Deposits are larger, rewards are smaller
    const amounts = isDeposit 
      ? TRANSACTION_AMOUNTS.DEPOSIT 
      : TRANSACTION_AMOUNTS.INTERNAL;
    const amount = amounts[i % amounts.length];
    
    const memos = isDeposit 
      ? TRANSACTION_MEMOS.DEPOSIT 
      : TRANSACTION_MEMOS.INTERNAL;
    const memo = memos[i % memos.length];

    // Spread transactions across past days
    const daysAgo = Math.floor(i / 2); // 2 transactions per day
    const createdAt = new Date(now);
    createdAt.setDate(createdAt.getDate() - daysAgo);

    transactions.push({
      user_id: MOCK_USER_ID,
      type,
      amount,
      status: 'completed',
      memo,
      created_at: createdAt.toISOString(),
    });
  }

  return transactions;
}

/**
 * Seed transactions for mock user
 */
export async function seedTransactions(
  serviceRole: ServiceRoleClient,
  userId: string
): Promise<SeedResult> {
  try {
    const transactions = generateTransactionData();

    const { data, error } = await serviceRole
      .from('transactions')
      .insert(transactions)
      .select();

    if (error) {
      throw new Error(`Failed to seed transactions: ${error.message}`);
    }

    return {
      count: data?.length || 0,
      data,
    };
  } catch (error) {
    return {
      count: 0,
      error: error instanceof Error ? error.message : 'Unknown error seeding transactions',
    };
  }
}