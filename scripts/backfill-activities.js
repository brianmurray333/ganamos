// Backfill activities table from posts, donations, and transactions
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET_API_KEY = process.env.SUPABASE_SECRET_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SECRET_API_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_API_KEY in environment variables.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_API_KEY);

async function backfillPosts() {
  console.log('Fetching posts...');
  const { data: posts, error } = await supabase.from('posts').select('*');
  if (error) throw error;
  let count = 0;
  for (const post of posts) {
    // Post created
    await supabase.from('activities').insert({
      id: uuidv4(),
      user_id: post.user_id || post.userId,
      type: 'post',
      related_id: post.id,
      related_table: 'posts',
      timestamp: post.created_at || post.createdAt,
      metadata: { title: post.title },
    });
    count++;
    // Post fixed
    if (post.fixed && post.fixed_by && post.fixed_at) {
      await supabase.from('activities').insert({
        id: uuidv4(),
        user_id: post.fixed_by,
        type: 'fix',
        related_id: post.id,
        related_table: 'posts',
        timestamp: post.fixed_at,
        metadata: { title: post.title },
      });
      count++;
      // Reward for fix
      if (post.reward) {
        await supabase.from('activities').insert({
          id: uuidv4(),
          user_id: post.fixed_by,
          type: 'reward',
          related_id: post.id,
          related_table: 'posts',
          timestamp: post.fixed_at,
          metadata: { title: post.title, sats: post.reward },
        });
        count++;
      }
    }
  }
  console.log(`Backfilled ${count} post/fix/reward activities.`);
}

async function backfillDonations() {
  console.log('Fetching donations...');
  const { data: donations, error } = await supabase.from('donations').select('*');
  if (error) throw error;
  let count = 0;
  for (const donation of donations) {
    await supabase.from('activities').insert({
      id: uuidv4(),
      user_id: donation.user_id || donation.donor_id,
      type: 'donation',
      related_id: donation.id,
      related_table: 'donations',
      timestamp: donation.created_at,
      metadata: {
        amount: donation.amount,
        location: donation.donation_pools?.location_name,
        message: donation.message,
      },
    });
    count++;
  }
  console.log(`Backfilled ${count} donation activities.`);
}

async function backfillTransactions() {
  console.log('Fetching transactions...');
  const { data: transactions, error } = await supabase.from('transactions').select('*');
  if (error) throw error;
  let count = 0;
  for (const tx of transactions) {
    await supabase.from('activities').insert({
      id: uuidv4(),
      user_id: tx.user_id,
      type: tx.type || 'transaction',
      related_id: tx.id,
      related_table: 'transactions',
      timestamp: tx.created_at,
      metadata: {
        amount: tx.amount,
        status: tx.status,
        description: tx.description,
      },
    });
    count++;
  }
  console.log(`Backfilled ${count} transaction activities.`);
}

async function main() {
  try {
    await backfillPosts();
    await backfillDonations();
    await backfillTransactions();
    console.log('Backfill complete!');
  } catch (err) {
    console.error('Error during backfill:', err);
  }
}

main(); 