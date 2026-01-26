#!/usr/bin/env node

/**
 * Vercel Log Analyzer for Security Events
 * 
 * Analyzes Vercel JSON logs to find evidence of hacker activity, specifically:
 * - Balance reconciliation failures
 * - Withdrawal attempts
 * - Suspended account attempts
 * - Rate limit violations
 * - IP addresses and user agents
 */

const fs = require('fs');
const path = require('path');

// Hacker's user ID
const HACKER_USER_ID = '75c9b493-0608-45bc-bc6d-9c648fbc88da';

// Time window for analysis (adjust based on when alerts were received)
// Format: ISO 8601 timestamps
const TIME_WINDOW = {
  start: '2026-01-03T00:00:00Z', // Adjust based on alert times
  end: '2026-01-03T23:59:59Z',
};

function parseLogs(logData) {
  let logs;
  
  // Handle different input formats
  if (typeof logData === 'string') {
    try {
      logs = JSON.parse(logData);
    } catch (e) {
      // Try parsing as newline-delimited JSON
      logs = logData.split('\n')
        .filter(line => line.trim())
        .map(line => {
          try {
            return JSON.parse(line);
          } catch (e) {
            return null;
          }
        })
        .filter(Boolean);
    }
  } else {
    logs = Array.isArray(logData) ? logData : [logData];
  }

  return logs;
}

function isInTimeWindow(timestamp) {
  if (!timestamp) return false;
  const time = new Date(timestamp).getTime();
  const start = new Date(TIME_WINDOW.start).getTime();
  const end = new Date(TIME_WINDOW.end).getTime();
  return time >= start && time <= end;
}

function extractSecurityEvents(logs) {
  const events = {
    reconciliationFailures: [],
    withdrawalAttempts: [],
    suspendedAccountAttempts: [],
    rateLimitViolations: [],
    depositAttempts: [],
    otherSecurityEvents: [],
  };

  logs.forEach((log, index) => {
    const message = log.message || log.text || JSON.stringify(log);
    const timestamp = log.timestamp || log.time || log.created_at || log.date;
    const level = log.level || log.severity || 'info';
    
    // Check if this log is related to the hacker
    const isHackerRelated = 
      message.includes(HACKER_USER_ID) ||
      (log.userId && log.userId === HACKER_USER_ID) ||
      (log.user_id && log.user_id === HACKER_USER_ID) ||
      (log.user && log.user === HACKER_USER_ID);

    // Only process logs in time window and related to hacker
    if (!isInTimeWindow(timestamp) || !isHackerRelated) {
      return;
    }

    // 1. Balance reconciliation failures
    if (
      message.includes('[SECURITY] Balance reconciliation failed') ||
      message.includes('Balance reconciliation failed') ||
      message.includes('reconciliation failed')
    ) {
      events.reconciliationFailures.push({
        timestamp,
        level,
        message,
        fullLog: log,
        ipAddress: log.ip_address || log.ip || log.x_forwarded_for || log['x-forwarded-for'],
        userAgent: log.user_agent || log.userAgent || log['user-agent'],
        storedBalance: log.storedBalance || log.stored_balance,
        calculatedBalance: log.calculatedBalance || log.calculated_balance,
        discrepancy: log.discrepancy,
      });
    }

    // 2. Withdrawal attempts
    if (
      message.includes('/api/wallet/withdraw') ||
      message.includes('[Withdraw API]') ||
      message.includes('withdrawal') ||
      (log.path && log.path.includes('/api/wallet/withdraw'))
    ) {
      events.withdrawalAttempts.push({
        timestamp,
        level,
        message,
        fullLog: log,
        ipAddress: log.ip_address || log.ip || log.x_forwarded_for || log['x-forwarded-for'],
        userAgent: log.user_agent || log.userAgent || log['user-agent'],
        method: log.method || 'POST',
        path: log.path || '/api/wallet/withdraw',
        statusCode: log.status || log.statusCode || log.status_code,
        amount: log.amount || log.body?.amount,
        paymentRequest: log.paymentRequest || log.body?.paymentRequest,
      });
    }

    // 3. Suspended account attempts
    if (
      message.includes('[SECURITY] Suspended account attempted') ||
      message.includes('suspended') ||
      message.includes('Account is suspended')
    ) {
      events.suspendedAccountAttempts.push({
        timestamp,
        level,
        message,
        fullLog: log,
        ipAddress: log.ip_address || log.ip || log.x_forwarded_for || log['x-forwarded-for'],
        userAgent: log.user_agent || log.userAgent || log['user-agent'],
      });
    }

    // 4. Rate limit violations
    if (
      message.includes('[SECURITY] Rate limit exceeded') ||
      message.includes('Rate limit exceeded') ||
      message.includes('rate limit') ||
      log.statusCode === 429
    ) {
      events.rateLimitViolations.push({
        timestamp,
        level,
        message,
        fullLog: log,
        ipAddress: log.ip_address || log.ip || log.x_forwarded_for || log['x-forwarded-for'],
        userAgent: log.user_agent || log.userAgent || log['user-agent'],
        requestCount: log.requestCount || log.request_count,
        maxAllowed: log.maxAllowed || log.max_allowed,
      });
    }

    // 5. Deposit attempts
    if (
      message.includes('/api/wallet/deposit') ||
      message.includes('createDepositInvoice') ||
      (log.path && log.path.includes('/api/wallet/deposit'))
    ) {
      events.depositAttempts.push({
        timestamp,
        level,
        message,
        fullLog: log,
        ipAddress: log.ip_address || log.ip || log.x_forwarded_for || log['x-forwarded-for'],
        userAgent: log.user_agent || log.userAgent || log['user-agent'],
        method: log.method || 'POST',
        path: log.path || '/api/wallet/deposit',
        statusCode: log.status || log.statusCode || log.status_code,
        amount: log.amount || log.body?.amount,
      });
    }

    // 6. Other security events
    if (
      message.includes('[SECURITY]') ||
      message.includes('SECURITY ALERT') ||
      level === 'error' && isHackerRelated
    ) {
      events.otherSecurityEvents.push({
        timestamp,
        level,
        message,
        fullLog: log,
        ipAddress: log.ip_address || log.ip || log.x_forwarded_for || log['x-forwarded-for'],
        userAgent: log.user_agent || log.userAgent || log['user-agent'],
      });
    }
  });

  return events;
}

function generateReport(events) {
  const report = {
    summary: {
      reconciliationFailures: events.reconciliationFailures.length,
      withdrawalAttempts: events.withdrawalAttempts.length,
      suspendedAccountAttempts: events.suspendedAccountAttempts.length,
      rateLimitViolations: events.rateLimitViolations.length,
      depositAttempts: events.depositAttempts.length,
      otherSecurityEvents: events.otherSecurityEvents.length,
    },
    uniqueIPs: new Set(),
    uniqueUserAgents: new Set(),
    timeline: [],
    events,
  };

  // Collect unique IPs and user agents
  Object.values(events).flat().forEach(event => {
    if (event.ipAddress && event.ipAddress !== 'unknown') {
      report.uniqueIPs.add(event.ipAddress);
    }
    if (event.userAgent && event.userAgent !== 'unknown') {
      report.uniqueUserAgents.add(event.userAgent);
    }
    if (event.timestamp) {
      report.timeline.push({
        timestamp: event.timestamp,
        type: Object.keys(events).find(key => events[key].includes(event)),
        event,
      });
    }
  });

  // Sort timeline
  report.timeline.sort((a, b) => 
    new Date(a.timestamp) - new Date(b.timestamp)
  );

  // Convert Sets to Arrays
  report.uniqueIPs = Array.from(report.uniqueIPs);
  report.uniqueUserAgents = Array.from(report.uniqueUserAgents);

  return report;
}

function printReport(report) {
  console.log('\n' + '='.repeat(80));
  console.log('VERCEL LOG SECURITY ANALYSIS REPORT');
  console.log('='.repeat(80));
  
  console.log('\n📊 SUMMARY');
  console.log('-'.repeat(80));
  console.log(`Balance Reconciliation Failures: ${report.summary.reconciliationFailures}`);
  console.log(`Withdrawal Attempts:            ${report.summary.withdrawalAttempts}`);
  console.log(`Suspended Account Attempts:     ${report.summary.suspendedAccountAttempts}`);
  console.log(`Rate Limit Violations:          ${report.summary.rateLimitViolations}`);
  console.log(`Deposit Attempts:               ${report.summary.depositAttempts}`);
  console.log(`Other Security Events:          ${report.summary.otherSecurityEvents}`);

  console.log('\n🌐 NETWORK INFORMATION');
  console.log('-'.repeat(80));
  console.log(`Unique IP Addresses (${report.uniqueIPs.length}):`);
  report.uniqueIPs.forEach(ip => console.log(`  - ${ip}`));
  
  console.log(`\nUnique User Agents (${report.uniqueUserAgents.length}):`);
  report.uniqueUserAgents.forEach(ua => console.log(`  - ${ua}`));

  if (report.summary.reconciliationFailures > 0) {
    console.log('\n🚨 BALANCE RECONCILIATION FAILURES');
    console.log('-'.repeat(80));
    report.events.reconciliationFailures.forEach((event, i) => {
      console.log(`\n${i + 1}. ${event.timestamp}`);
      console.log(`   IP: ${event.ipAddress || 'Unknown'}`);
      console.log(`   User Agent: ${event.userAgent || 'Unknown'}`);
      if (event.discrepancy) {
        console.log(`   Discrepancy: ${event.discrepancy} sats`);
      }
      console.log(`   Message: ${event.message.substring(0, 200)}...`);
    });
  }

  if (report.summary.withdrawalAttempts > 0) {
    console.log('\n💰 WITHDRAWAL ATTEMPTS');
    console.log('-'.repeat(80));
    report.events.withdrawalAttempts.forEach((event, i) => {
      console.log(`\n${i + 1}. ${event.timestamp}`);
      console.log(`   IP: ${event.ipAddress || 'Unknown'}`);
      console.log(`   User Agent: ${event.userAgent || 'Unknown'}`);
      console.log(`   Status: ${event.statusCode || 'Unknown'}`);
      if (event.amount) {
        console.log(`   Amount: ${event.amount} sats`);
      }
      console.log(`   Message: ${event.message.substring(0, 200)}...`);
    });
  }

  if (report.summary.depositAttempts > 0) {
    console.log('\n📥 DEPOSIT ATTEMPTS');
    console.log('-'.repeat(80));
    report.events.depositAttempts.forEach((event, i) => {
      console.log(`\n${i + 1}. ${event.timestamp}`);
      console.log(`   IP: ${event.ipAddress || 'Unknown'}`);
      console.log(`   User Agent: ${event.userAgent || 'Unknown'}`);
      console.log(`   Status: ${event.statusCode || 'Unknown'}`);
      if (event.amount) {
        console.log(`   Amount: ${event.amount} sats`);
      }
      console.log(`   Message: ${event.message.substring(0, 200)}...`);
    });
  }

  if (report.summary.suspendedAccountAttempts > 0) {
    console.log('\n🚫 SUSPENDED ACCOUNT ATTEMPTS');
    console.log('-'.repeat(80));
    report.events.suspendedAccountAttempts.forEach((event, i) => {
      console.log(`\n${i + 1}. ${event.timestamp}`);
      console.log(`   IP: ${event.ipAddress || 'Unknown'}`);
      console.log(`   User Agent: ${event.userAgent || 'Unknown'}`);
      console.log(`   Message: ${event.message.substring(0, 200)}...`);
    });
  }

  console.log('\n⏰ TIMELINE');
  console.log('-'.repeat(80));
  report.timeline.forEach((item, i) => {
    const time = new Date(item.timestamp).toISOString();
    console.log(`${i + 1}. [${time}] ${item.type.toUpperCase()}`);
  });

  console.log('\n' + '='.repeat(80));
}

// Main execution
function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: node analyze-vercel-logs.js <log-file.json>');
    console.error('   or: node analyze-vercel-logs.js (reads from stdin)');
    process.exit(1);
  }

  let logData;
  
  if (args[0] === '-' || args[0] === 'stdin') {
    // Read from stdin
    logData = fs.readFileSync(0, 'utf-8');
  } else {
    // Read from file
    const logFile = path.resolve(args[0]);
    if (!fs.existsSync(logFile)) {
      console.error(`Error: Log file not found: ${logFile}`);
      process.exit(1);
    }
    logData = fs.readFileSync(logFile, 'utf-8');
  }

  try {
    const logs = parseLogs(logData);
    console.log(`Parsed ${logs.length} log entries`);
    
    const events = extractSecurityEvents(logs);
    const report = generateReport(events);
    printReport(report);

    // Optionally save detailed report to file
    if (args[1] === '--save') {
      const outputFile = `security-report-${Date.now()}.json`;
      fs.writeFileSync(outputFile, JSON.stringify(report, null, 2));
      console.log(`\n📄 Detailed report saved to: ${outputFile}`);
    }
  } catch (error) {
    console.error('Error analyzing logs:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { parseLogs, extractSecurityEvents, generateReport };

