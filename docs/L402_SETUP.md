# L402 Job Posting API Setup

This document describes the L402 (Lightning HTTP 402 Protocol) implementation for job posting on Ganamos.

## Overview

The L402 protocol allows API endpoints to require Lightning Network payments for access. When a client makes a request without proper authentication, the server responds with a `402 Payment Required` status and a Lightning invoice. After payment, the client can access the API using the payment proof.

## Environment Variables

Add the following to your `.env.local` file:

```bash
# L402 Root Key (used for macaroon signing)
# Generate a secure random key for production
L402_ROOT_KEY=your-secure-random-key-here-change-in-production
```

## API Endpoint

### POST /api/posts

Creates a new job posting via L402-protected API.

**Cost:** Variable (100-10,000 satoshis, default 500) per job posting

**Flow:**
1. Client makes POST request without L402 token
2. Server responds with 402 Payment Required + Lightning invoice + Macaroon
3. Client pays Lightning invoice and obtains preimage
4. Client makes POST request with L402 token (Macaroon + preimage)
5. Server validates payment and creates job posting

**Request Body:**
```json
{
  "title": "Job title (optional)",
  "description": "Job description (required)",
  "image_url": "https://... (optional)",
  "location": "Location name (optional)",
  "latitude": 37.7749,
  "longitude": -122.4194,
  "reward": 1000
}
```

**L402 Authorization Header:**
```
Authorization: L402 <base64-macaroon>:<hex-preimage>
```

## Reference Implementation

A complete reference website is available in the `reference-site/` directory:

- `index.html` - Job posting form with L402 payment flow
- `script.js` - JavaScript implementation of L402 client

To use the reference site:

1. Start your Ganamos development server: `npm run dev`
2. Open `reference-site/index.html` in a web browser
3. Fill out the job posting form
4. Pay the Lightning invoice when prompted
5. Job will be created after payment confirmation

## Testing with cURL

### Step 1: Get Payment Challenge
```bash
curl -X POST http://localhost:3457/api/posts \
  -H "Content-Type: application/json" \
  -d '{"description": "Test job", "reward": 1000, "api_cost": 750}'
```

Response (402 Payment Required):
```json
{
  "error": "Payment required to create post",
  "amount": 750,
  "currency": "sats",
  "payment_request": "lnbc7500n1p...",
  "cost_range": {
    "min": 100,
    "max": 10000,
    "default": 500
  }
}
```

### Step 2: Pay Invoice and Get Preimage
Pay the Lightning invoice using your wallet and extract the preimage.

### Step 3: Create Job with L402 Token
```bash
curl -X POST http://localhost:3457/api/posts \
  -H "Content-Type: application/json" \
  -H "Authorization: L402 <macaroon>:<preimage>" \
  -d '{"description": "Test job", "reward": 1000}'
```

## Files Created

- `lib/l402.ts` - L402 protocol implementation
- `app/api/posts/route.ts` - L402-protected posts API endpoint
- `reference-site/` - Complete reference implementation

## Security Notes

- Change the `L402_ROOT_KEY` in production
- Macaroons expire after 1 hour
- Payment verification ensures invoices are actually paid
- All Lightning operations use your existing LND configuration

## Integration with Existing System

The L402 implementation extends your existing anonymous posting system:
- Uses existing `createFundedAnonymousPostAction`
- Posts appear in the same database table
- Compatible with existing Lightning infrastructure
- No changes needed to existing web app functionality
