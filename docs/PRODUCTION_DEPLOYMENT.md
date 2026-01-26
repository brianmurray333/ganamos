# L402 Job Posting - Production Deployment Guide

## 🚀 Vercel Deployment Steps

### **1. Environment Variables**

Add these to your Vercel project settings:

```bash
# L402 Authentication (REQUIRED)
L402_ROOT_KEY=97cc6dfa1f1234e7b72fdb57bb49daf83da23b352185c8e707ddc9fd2b3174be

# Your existing variables should already be set:
# SUPABASE_URL=...
# SUPABASE_ANON_KEY=...
# SUPABASE_SERVICE_ROLE_KEY=...
# LND_REST_URL=...
# LND_ADMIN_MACAROON=...
# GOOGLE_MAPS_API_KEY=...
# COINMARKETCAP_API_KEY=...
```

### **2. Deploy to Vercel**

```bash
# Install Vercel CLI (if not already installed)
npm install -g vercel

# Deploy from your project root
cd /Users/brianmurray/Desktop/ganamos
vercel

# Follow prompts:
# - Link to existing project or create new
# - Set project name (e.g., "ganamos")
# - Deploy
```

### **3. Production URLs**

After deployment, your L402 API will be available at:

- **Main App**: `https://your-project.vercel.app`
- **L402 API**: `https://your-project.vercel.app/api/posts`
- **Job Posts**: `https://your-project.vercel.app/post/{id}`

### **4. Test Production L402**

```bash
# Test the production L402 API
curl -X POST https://your-project.vercel.app/api/posts \
  -H "Content-Type: application/json" \
  -d '{"description": "Test production job", "reward": 1000}'

# Should return 402 Payment Required with Lightning invoice
```

## 🔐 Security Features (Production Ready)

### **✅ Already Implemented:**

1. **Secure L402 Root Key** - Cryptographically secure 256-bit key
2. **Development-Only CORS** - CORS headers only in development
3. **Lightning Authentication** - Real payment verification required
4. **Input Validation** - All API inputs validated and sanitized
5. **Rate Limiting** - 10-minute payment timeout prevents abuse
6. **Macaroon Expiry** - L402 tokens expire after 1 hour

### **✅ Production Hardened:**

- **No CORS in production** - Prevents unauthorized cross-origin access
- **Environment-based configuration** - Different settings for dev/prod
- **Secure payment verification** - Uses real Lightning Network proofs
- **Database constraints** - Proper validation at database level

## 📊 Monitoring & Analytics

### **What to Monitor:**

1. **L402 API Usage**: Track POST `/api/posts` requests
2. **Payment Success Rate**: Monitor 402 → 201 conversion
3. **Lightning Invoice Status**: Track settlement rates
4. **Job Posting Volume**: Monitor created posts
5. **Revenue**: Track API fees collected (10 sats per job)

### **Vercel Analytics:**

Enable Vercel Analytics to track:
- API endpoint usage
- Response times
- Error rates
- Geographic distribution

## 🎯 API Documentation (Production)

### **Endpoint**: `POST https://your-domain.vercel.app/api/posts`

**Authentication**: L402 (Lightning HTTP 402 Protocol)  
**Cost**: Variable (job reward + 10 sats API fee)

**Request Body**:
```json
{
  "title": "Job title",
  "description": "Job description", 
  "image_url": "data:image/jpeg;base64,..." or null,
  "location": "Location name",
  "latitude": 37.7749,
  "longitude": -122.4194,
  "reward": 1000
}
```

**Response Flow**:
1. **402 Payment Required** → Lightning invoice + L402 macaroon
2. **Pay Lightning invoice** → Get payment preimage
3. **POST with L402 token** → Job created successfully

## 🚀 Next Steps After Deployment

1. **Test the production API** with real Lightning payments
2. **Update reference site** to use production URLs
3. **Share API documentation** with potential users
4. **Monitor usage and revenue** via Vercel dashboard
5. **Scale as needed** - Vercel handles traffic automatically

## 💡 Business Model

Your L402 API creates a new revenue stream:
- **10 sats per job posting** (API fee)
- **Variable job rewards** (user-funded)
- **Automatic payment processing** via Lightning Network
- **Global accessibility** - Anyone with Lightning wallet can use

**This is a groundbreaking implementation of Lightning Network monetization!** 🎉⚡
