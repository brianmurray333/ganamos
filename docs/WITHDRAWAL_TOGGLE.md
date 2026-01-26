# Withdrawal Toggle - Emergency Disable/Enable

Withdrawals can be instantly disabled or enabled via a database setting. This provides immediate control without requiring code changes or deployments.

## Quick Toggle Commands

### Disable Withdrawals (Emergency)
```sql
UPDATE system_settings 
SET withdrawals_enabled = false, updated_at = NOW() 
WHERE id = 'main';
```

### Enable Withdrawals
```sql
UPDATE system_settings 
SET withdrawals_enabled = true, updated_at = NOW() 
WHERE id = 'main';
```

### Check Current Status
```sql
SELECT withdrawals_enabled, updated_at 
FROM system_settings 
WHERE id = 'main';
```

## How It Works

1. **Database Setting**: The `system_settings` table stores the `withdrawals_enabled` boolean flag
2. **Route Check**: The withdrawal API route checks this setting before processing any withdrawal
3. **Default Behavior**: If the setting doesn't exist, withdrawals are enabled by default
4. **Instant Effect**: Changes take effect immediately (no deployment needed)

## Response When Disabled

When withdrawals are disabled, all withdrawal requests return:
- **Status Code**: 503 (Service Unavailable)
- **Error Message**: "Withdrawals are temporarily disabled for security maintenance"

## Migration

The `system_settings` table is created by migration: `20260104071001_add_system_settings_withdrawals_toggle.sql`

This table can be extended in the future for other system-wide feature flags.

