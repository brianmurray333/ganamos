# Non-Custodial Wallet Support

This document describes the implementation of non-custodial Lightning wallet support in Ganamos using Nostr Wallet Connect (NWC).

## Overview

Users can now connect their own Lightning wallets (Alby, Zeus, Mutiny, etc.) to Ganamos for a fully non-custodial experience. When connected, payments go directly to/from the user's wallet without Ganamos ever holding their funds.

## Key Features

### 1. Wallet Connection
- Users can connect any NWC-compatible wallet
- Connection requires pasting the NWC connection string from their wallet
- Connection is validated before being saved
- Only one non-custodial wallet per user at a time

### 2. Dual Wallet Support
- Users maintain their existing Ganamos custodial balance
- Can choose which wallet to use for each Lightning payment
- Non-custodial wallet is the default when connected
- Can switch back to custodial wallet for individual payments

### 3. Dismissable Prompt
- New users see a banner encouraging wallet connection
- Banner can be dismissed and won't appear again
- Connection option always accessible via menu (⋮)

## Supported Wallets

Any wallet that supports Nostr Wallet Connect (NWC):
- **Alby** (browser extension & mobile)
- **Zeus** (mobile)
- **Mutiny** (web & mobile)
- **Primal** (mobile)
- **Amethyst** (mobile)
- Any other NWC-compatible wallet

## User Flow

### Connecting a Wallet

1. Go to Wallet tab
2. Click "Connect Lightning Wallet" from banner or menu
3. Open your wallet app and get the NWC connection string
4. Paste the connection string
5. Wallet is tested and connected

### Making Payments

1. Go to Send/Withdraw
2. Enter Lightning invoice or recipient
3. Choose payment source (if both wallets available):
   - Connected wallet (non-custodial)
   - Ganamos wallet (custodial)
4. Confirm payment

### Disconnecting

1. Go to Wallet tab
2. Click the unlink icon on the connected wallet card
3. Confirm disconnection
4. Falls back to custodial wallet

## Security Considerations

### Connection String Security
- Connection strings contain a secret key
- Stored encrypted in database
- Never logged or exposed in client
- Transmitted only over HTTPS

### Rate Limiting
- 5 connection attempts per hour
- 10 payments per minute via NWC
- Prevents brute force attacks

### Audit Logging
All wallet operations are logged:
- Connection/disconnection events
- Payment attempts (success/failure)
- Invoice creation

## API Endpoints

### `POST /api/wallet/nwc/connect`
Connect a new NWC wallet.

**Request:**
```json
{
  "connectionString": "nostr+walletconnect://...",
  "walletName": "My Wallet"
}
```

### `POST /api/wallet/nwc/disconnect`
Disconnect the active NWC wallet.

### `GET /api/wallet/nwc/status`
Get current wallet status and prompt dismissal state.

**Response:**
```json
{
  "success": true,
  "hasNWCWallet": true,
  "wallet": {
    "id": "uuid",
    "name": "My Wallet",
    "status": "connected"
  },
  "custodialBalance": 10000,
  "promptDismissed": false
}
```

### `POST /api/wallet/nwc/pay`
Pay a Lightning invoice using the connected wallet.

**Request:**
```json
{
  "paymentRequest": "lnbc...",
  "amount": 1000
}
```

### `POST /api/wallet/nwc/dismiss-prompt`
Dismiss the wallet connection prompt.

## Database Schema

### `user_wallets` Table
Stores NWC wallet connections.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | User reference |
| wallet_type | ENUM | 'custodial' or 'nwc' |
| nwc_connection_encrypted | TEXT | Encrypted connection string |
| nwc_relay_url | TEXT | Relay URL |
| nwc_pubkey | TEXT | Wallet public key |
| wallet_name | TEXT | User-friendly name |
| connection_status | TEXT | 'connected', 'disconnected', 'error' |
| is_active | BOOLEAN | Only one active per user |

### `wallet_connection_audit` Table
Audit log for all wallet operations.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | User reference |
| wallet_id | UUID | Wallet reference |
| action | TEXT | Operation type |
| details | JSONB | Additional context |
| ip_address | TEXT | Client IP |
| created_at | TIMESTAMPTZ | Timestamp |

### Profile Additions
- `wallet_prompt_dismissed` - Boolean flag
- `wallet_prompt_dismissed_at` - Timestamp

## Files Added/Modified

### New Files
- `lib/nwc.ts` - NWC service library
- `lib/wallet-router.ts` - Payment routing logic
- `components/wallet-connection-modal.tsx` - Connection flow UI
- `components/wallet-connect-banner.tsx` - Dismissable prompt
- `components/connected-wallet-card.tsx` - Connected wallet display
- `app/api/wallet/nwc/connect/route.ts`
- `app/api/wallet/nwc/disconnect/route.ts`
- `app/api/wallet/nwc/status/route.ts`
- `app/api/wallet/nwc/dismiss-prompt/route.ts`
- `app/api/wallet/nwc/pay/route.ts`
- `supabase/migrations/20260122213119_add_non_custodial_wallet_support.sql`

### Modified Files
- `app/wallet/page.tsx` - Added banner, wallet card, menu
- `app/wallet/withdraw/page.tsx` - Added wallet selector
- `lib/database.types.ts` - Added new table types
- `package.json` - Added @getalby/sdk dependency

## Future Enhancements

1. **LNURL Support** - For wallets without NWC
2. **Direct Node Connection** - LND/CLN REST API
3. **WebLN Integration** - Browser extension support
4. **Lightning Address** - Automatic routing
5. **Multi-wallet** - Connect multiple wallets

## Testing

Run the app and:
1. Navigate to /wallet
2. Check that the banner appears (if not dismissed)
3. Click "Connect Wallet" and test with a real NWC string
4. Verify connection shows in UI
5. Test payment flow with wallet selector
6. Test disconnection

## Dependencies

- `@getalby/sdk` - Alby SDK for NWC communication
- Existing Supabase infrastructure
