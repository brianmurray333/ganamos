const fs = require('fs');
const readline = require('readline');

const backupFile = '/Users/brianmurray/Downloads/db_cluster-27-10-2025@07-44-27.backup.gz';

async function createRestoreSQL() {
  console.log('🔧 Creating safe restore SQL script...');
  console.log('');

  // Handle gzipped files by extracting to temp file first
  let inputFile = backupFile;
  if (backupFile.endsWith('.gz')) {
    console.log('📦 Extracting gzipped backup...');
    const { execSync } = require('child_process');
    const tempFile = '/tmp/ganamos_backup_temp.sql';
    execSync(`gunzip -c "${backupFile}" > ${tempFile}`);
    inputFile = tempFile;
    console.log('✅ Extracted');
  }

  const fileStream = fs.createReadStream(inputFile);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let inTransactionsSection = false;
  let transactionCount = 0;
  const restoreSQL = [];

  // Add header
  restoreSQL.push('-- Restore transactions from Oct 28 backup');
  restoreSQL.push('-- This script safely inserts missing transactions');
  restoreSQL.push('-- Generated: ' + new Date().toISOString());
  restoreSQL.push('');
  restoreSQL.push('-- Step 1: Backup current transactions');
  restoreSQL.push('CREATE TABLE IF NOT EXISTS transactions_backup_before_restore_' + new Date().toISOString().split('T')[0].replace(/-/g, '') + ' AS ');
  restoreSQL.push('SELECT * FROM transactions;');
  restoreSQL.push('');
  restoreSQL.push('-- Step 2: Insert missing transactions (ON CONFLICT DO NOTHING to preserve current data)');
  restoreSQL.push('');

  for await (const line of rl) {
    if (line.startsWith('COPY public.transactions')) {
      inTransactionsSection = true;
      console.log('✅ Found transactions table');
      continue;
    }

    if (inTransactionsSection && line.startsWith('\\.')) {
      console.log('✅ End of transactions table');
      inTransactionsSection = false;
      continue;
    }

    if (inTransactionsSection && line.trim() && !line.startsWith('-')) {
      transactionCount++;
      
      const parts = line.split('\t');
      if (parts.length >= 11) {
        // Escape single quotes in memo
        const memo = (parts[8] || '').replace(/'/g, "''");
        
        // Only include transactions from Oct 28 or earlier (to avoid any potential overlap with Oct 28-30 data)
        const txDate = parts[9];
        if (txDate && txDate < '2025-10-29') {
          const insertSQL = `INSERT INTO transactions (
  id, user_id, type, amount, status, r_hash_str, payment_request, payment_hash, memo, created_at, updated_at
) VALUES (
  '${parts[0]}',
  '${parts[1]}',
  '${parts[2]}',
  ${parts[3]},
  '${parts[4]}',
  ${parts[5] === '\\N' ? 'NULL' : "'" + parts[5] + "'"},
  ${parts[6] === '\\N' ? 'NULL' : "'" + parts[6].replace(/'/g, "''") + "'"},
  ${parts[7] === '\\N' ? 'NULL' : "'" + parts[7] + "'"},
  ${memo ? "'" + memo + "'" : 'NULL'},
  '${parts[9]}',
  '${parts[10]}'
) ON CONFLICT (id) DO NOTHING;`;
          
          restoreSQL.push(insertSQL);
        }
      }
    }
  }

  // Add footer
  restoreSQL.push('');
  restoreSQL.push('-- Step 3: Verify restore');
  restoreSQL.push('SELECT ');
  restoreSQL.push('  \'Restore complete\' as status,');
  restoreSQL.push('  (SELECT COUNT(*) FROM transactions) as total_transactions,');
  restoreSQL.push('  (SELECT COUNT(*) FROM transactions WHERE created_at < \'2025-10-29\') as restored_transactions,');
  restoreSQL.push('  (SELECT COUNT(*) FROM transactions WHERE created_at >= \'2025-10-29\') as current_transactions;');
  restoreSQL.push('');

  // Clean up temp file if we created one
  if (inputFile !== backupFile) {
    fs.unlinkSync(inputFile);
  }

  // Write to file
  const outputFile = 'scripts/restore-transactions-safe.sql';
  fs.writeFileSync(outputFile, restoreSQL.join('\n'));
  
  console.log(`📊 Processed ${transactionCount} transactions from backup`);
  console.log(`✅ Created restore script: ${outputFile}`);
  console.log('');
  console.log('⚠️  Next steps:');
  console.log('1. Review the restore script');
  console.log('2. Run it in Supabase SQL Editor');
  console.log('3. Verify the results');
  console.log('');
}

createRestoreSQL().catch(console.error);

