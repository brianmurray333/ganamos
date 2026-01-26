// Backfill activities for internal transfers
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET_API_KEY = process.env.SUPABASE_SECRET_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SECRET_API_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SECRET_API_KEY in environment variables.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_API_KEY);

async function backfillInternalTransferActivities() {
  console.log('🔄 Fetching internal transactions...');
  
  // Get all internal transactions
  const { data: transactions, error: transactionsError } = await supabase
    .from('transactions')
    .select('*')
    .eq('type', 'internal')
    .order('created_at', { ascending: true });
  
  if (transactionsError) {
    console.error('❌ Error fetching transactions:', transactionsError);
    process.exit(1);
  }
  
  console.log(`📊 Found ${transactions.length} internal transactions`);
  
  let created = 0;
  let skipped = 0;
  
  for (const tx of transactions) {
    // Check if activity already exists for this transaction
    const { data: existingActivity } = await supabase
      .from('activities')
      .select('id')
      .eq('related_id', tx.id)
      .eq('related_table', 'transactions')
      .eq('user_id', tx.user_id)
      .single();
    
    if (existingActivity) {
      skipped++;
      continue;
    }
    
    // Create activity for this internal transfer
    const { error: insertError } = await supabase
      .from('activities')
      .insert({
        id: uuidv4(),
        user_id: tx.user_id,
        type: 'internal',
        related_id: tx.id,
        related_table: 'transactions',
        timestamp: tx.created_at,
        metadata: {
          amount: tx.amount,
          memo: tx.memo,
          status: tx.status
        }
      });
    
    if (insertError) {
      console.error(`❌ Error creating activity for transaction ${tx.id}:`, insertError);
    } else {
      created++;
      if (created % 10 === 0) {
        console.log(`✅ Created ${created} activities...`);
      }
    }
  }
  
  console.log('');
  console.log(`✅ Backfill complete!`);
  console.log(`   Created: ${created}`);
  console.log(`   Skipped (already exist): ${skipped}`);
}

backfillInternalTransferActivities().catch(console.error);

