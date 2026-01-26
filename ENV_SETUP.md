# Environment Configuration Setup

## Admin Email Configuration

This application requires an admin email to be configured for:
- Admin authentication and access control
- Daily summary email notifications
- Withdrawal approval notifications
- Pet order notifications

### Setup Instructions

1. Create a `.env.local` file in the root directory (this file is gitignored)

2. Add the following variable:
```
ADMIN_EMAIL=your-admin-email@example.com
```

3. Replace `your-admin-email@example.com` with your actual admin email address

### Example `.env.local` file:
```
ADMIN_EMAIL=admin@yourdomain.com
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
RESEND_API_KEY=your-resend-api-key
```

## Database Setup

After setting up your environment variables, you'll need to run the database migrations and update the admin email references in the migration files to match your `ADMIN_EMAIL`.

See `supabase/migrations/` for migration files that may need admin email updates.
