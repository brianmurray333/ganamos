const fs = require('fs');
const readline = require('readline');

const backupFile = '/Users/brianmurray/Downloads/db_cluster-24-10-2025@07-44-19.backup';

async function extractTransactions() {
  console.log('🔍 Extracting transactions from backup...');
  console.log('');

  const fileStream = fs.createReadStream(backupFile);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let inTransactionsSection = false;
  let transactionCount = 0;
  const transactions = [];
  const sampleSize = 10; // Show first 10 and last 10

  for await (const line of rl) {
    // Look for start of transactions COPY section
    if (line.startsWith('COPY public.transactions')) {
      inTransactionsSection = true;
      console.log('✅ Found transactions table');
      continue;
    }

    // Look for end of COPY section
    if (inTransactionsSection && line.startsWith('\\.')) {
      console.log('✅ End of transactions table');
      inTransactionsSection = false;
      continue;
    }

    // Process transaction lines
    if (inTransactionsSection && line.trim() && !line.startsWith('-')) {
      transactionCount++;
      
      // Parse the tab-separated values
      const parts = line.split('\t');
      if (parts.length >= 11) {
        const tx = {
          id: parts[0],
          user_id: parts[1],
          type: parts[2],
          amount: parseInt(parts[3]),
          status: parts[4],
          r_hash_str: parts[5],
          payment_request: parts[6],
          payment_hash: parts[7],
          memo: parts[8],
          created_at: parts[9],
          updated_at: parts[10]
        };
        transactions.push(tx);
      }
    }
  }

  console.log(`📊 Found ${transactionCount} transactions in backup`);
  console.log('');

  // Show summary
  console.log('📋 Transaction Summary:');
  console.log('='.repeat(80));
  
  const byType = {};
  const byUser = {};
  const byDate = {};
  
  transactions.forEach(tx => {
    byType[tx.type] = (byType[tx.type] || 0) + 1;
    byUser[tx.user_id] = (byUser[tx.user_id] || 0) + 1;
    const date = tx.created_at.substring(0, 10);
    byDate[date] = (byDate[date] || 0) + 1;
  });

  console.log('\nBy Type:');
  Object.entries(byType).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
  });

  console.log('\nTop 10 Users by Transaction Count:');
  Object.entries(byUser)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([userId, count]) => {
      console.log(`  ${userId}: ${count} transactions`);
    });

  console.log('\nTransactions by Date:');
  Object.entries(byDate)
    .sort()
    .forEach(([date, count]) => {
      console.log(`  ${date}: ${count} transactions`);
    });

  // Show sample transactions
  console.log('\n📝 Sample Transactions (First 10):');
  console.log('='.repeat(80));
  transactions.slice(0, 10).forEach((tx, i) => {
    console.log(`${i + 1}. ${tx.type.toUpperCase()} | ${tx.amount} sats | ${tx.status}`);
    console.log(`   User: ${tx.user_id}`);
    console.log(`   Date: ${tx.created_at}`);
    console.log(`   Memo: ${tx.memo || 'None'}`);
    console.log('');
  });

  console.log('\n📝 Sample Transactions (Last 10):');
  console.log('='.repeat(80));
  transactions.slice(-10).forEach((tx, i) => {
    console.log(`${i + 1}. ${tx.type.toUpperCase()} | ${tx.amount} sats | ${tx.status}`);
    console.log(`   User: ${tx.user_id}`);
    console.log(`   Date: ${tx.created_at}`);
    console.log(`   Memo: ${tx.memo || 'None'}`);
    console.log('');
  });

  // Check if these transactions overlap with current ones
  console.log('\n🔍 Checking for date overlap:');
  const backupDates = Object.keys(byDate).sort();
  const oldestDate = backupDates[0];
  const newestDate = backupDates[backupDates.length - 1];
  console.log(`Backup date range: ${oldestDate} to ${newestDate}`);
  console.log(`Current transactions: Oct 28-30, 2025`);
  
  if (newestDate < '2025-10-28') {
    console.log('✅ NO OVERLAP - Backup is safe to merge');
  } else {
    console.log('⚠️  POTENTIAL OVERLAP - Need to handle duplicates carefully');
  }

  // Save to JSON for inspection
  fs.writeFileSync('backup_transactions_summary.json', JSON.stringify({
    total: transactionCount,
    byType,
    byDate,
    sampleTransactions: transactions.slice(0, 20)
  }, null, 2));
  
  console.log('\n✅ Summary saved to: backup_transactions_summary.json');
  console.log('');
  console.log('Next step: Review this data and decide if you want to restore it.');
}

extractTransactions().catch(console.error);

