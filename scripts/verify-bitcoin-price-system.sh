#!/bin/bash

# Verification script for Bitcoin price caching system

echo "🔍 Bitcoin Price System Verification"
echo "===================================="
echo ""

# Test 1: Check public API endpoint
echo "1️⃣  Testing /api/bitcoin-price (public endpoint)..."
PRICE_RESPONSE=$(curl -s "https://www.ganamos.earth/api/bitcoin-price")
PRICE_STATUS=$?

if [ $PRICE_STATUS -eq 0 ]; then
  echo "✅ Response received:"
  echo "$PRICE_RESPONSE" | jq '.' 2>/dev/null || echo "$PRICE_RESPONSE"
else
  echo "❌ Failed to connect"
fi

echo ""
echo "---"
echo ""

# Test 2: Check cron endpoint (if CRON_SECRET is set)
if [ -n "$CRON_SECRET" ]; then
  echo "2️⃣  Testing /api/cron/update-bitcoin-price (cron endpoint)..."
  CRON_RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "https://www.ganamos.earth/api/cron/update-bitcoin-price" \
    -H "Authorization: Bearer $CRON_SECRET")
  
  HTTP_BODY=$(echo "$CRON_RESPONSE" | head -n -1)
  HTTP_STATUS=$(echo "$CRON_RESPONSE" | tail -n 1)
  
  if [ "$HTTP_STATUS" = "200" ]; then
    echo "✅ Cron endpoint working! Status: $HTTP_STATUS"
    echo "$HTTP_BODY" | jq '.' 2>/dev/null || echo "$HTTP_BODY"
  else
    echo "⚠️  Status: $HTTP_STATUS"
    echo "$HTTP_BODY"
  fi
else
  echo "2️⃣  Skipping cron test (set CRON_SECRET to test)"
fi

echo ""
echo "---"
echo ""

# Test 3: Check device config endpoint
echo "3️⃣  Testing /api/device/config (device endpoint)..."
echo "   (This will return 404 without a valid pairing code, but checks if route exists)"
DEVICE_RESPONSE=$(curl -s -w "\n%{http_code}" "https://www.ganamos.earth/api/device/config?pairingCode=TEST123")
HTTP_STATUS=$(echo "$DEVICE_RESPONSE" | tail -n 1)

if [ "$HTTP_STATUS" = "404" ]; then
  echo "✅ Endpoint exists (404 expected with invalid code)"
elif [ "$HTTP_STATUS" = "200" ]; then
  echo "✅ Endpoint working! Status: 200"
  HTTP_BODY=$(echo "$DEVICE_RESPONSE" | head -n -1)
  echo "$HTTP_BODY" | jq '.config.btcPrice' 2>/dev/null
else
  echo "⚠️  Unexpected status: $HTTP_STATUS"
fi

echo ""
echo "===================================="
echo "💡 Next steps:"
echo "   1. If all endpoints work: System is ready!"
echo "   2. If 404s: Deployment still in progress, wait 2-3 minutes"
echo "   3. Check Vercel dashboard for deployment status"



