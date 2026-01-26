#!/bin/bash

# Test script for Bitcoin price cron job
# This manually triggers the cron endpoint to verify it's working

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔧 Bitcoin Price Cron Job Test Script"
echo "======================================"
echo ""

# Check if CRON_SECRET is provided
if [ -z "$CRON_SECRET" ]; then
  echo -e "${RED}❌ Error: CRON_SECRET environment variable not set${NC}"
  echo ""
  echo "Usage:"
  echo "  CRON_SECRET=your_secret ./scripts/test-bitcoin-price-update.sh"
  echo ""
  echo "Or set it in your environment:"
  echo "  export CRON_SECRET=your_secret"
  echo "  ./scripts/test-bitcoin-price-update.sh"
  exit 1
fi

# Determine URL (default to production, or use LOCAL_TEST=1 for localhost)
if [ "$LOCAL_TEST" = "1" ]; then
  URL="http://localhost:3000/api/cron/update-bitcoin-price"
  echo -e "${YELLOW}🏠 Testing against LOCAL development server${NC}"
else
  URL="https://www.ganamos.earth/api/cron/update-bitcoin-price"
  echo -e "${GREEN}🌍 Testing against PRODUCTION${NC}"
fi

echo "URL: $URL"
echo ""

# Make the request
echo "📡 Sending request..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$URL" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json")

# Split response body and status code
HTTP_BODY=$(echo "$RESPONSE" | head -n -1)
HTTP_STATUS=$(echo "$RESPONSE" | tail -n 1)

echo ""
echo "Response Status: $HTTP_STATUS"
echo "Response Body:"
echo "$HTTP_BODY" | jq '.' 2>/dev/null || echo "$HTTP_BODY"
echo ""

# Check result
if [ "$HTTP_STATUS" = "200" ]; then
  echo -e "${GREEN}✅ Success! Bitcoin price updated${NC}"
  
  # Extract price from JSON response
  PRICE=$(echo "$HTTP_BODY" | jq -r '.price' 2>/dev/null)
  if [ "$PRICE" != "null" ] && [ -n "$PRICE" ]; then
    echo -e "${GREEN}💰 Current BTC Price: \$$PRICE${NC}"
  fi
  
  exit 0
elif [ "$HTTP_STATUS" = "401" ]; then
  echo -e "${RED}❌ Unauthorized: CRON_SECRET is incorrect${NC}"
  exit 1
elif [ "$HTTP_STATUS" = "500" ]; then
  echo -e "${RED}❌ Server Error: Check logs for details${NC}"
  exit 1
else
  echo -e "${RED}❌ Unexpected response status: $HTTP_STATUS${NC}"
  exit 1
fi

