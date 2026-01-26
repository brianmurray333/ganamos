# Supabase Email Templates

Custom email templates for Supabase Auth that match the Ganamos branding.

## Setup Instructions

1. Go to your Supabase Dashboard
2. Navigate to **Authentication** → **Email Templates**
3. Copy and paste each template into the corresponding email type

## Template Files

- **supabase-confirm-signup.html** → Confirm signup
- **supabase-magic-link.html** → Magic Link  
- **supabase-password-reset.html** → Reset Password
- **supabase-email-change.html** → Change Email Address
- **supabase-invite.html** → Invite User

## Template Variables

Supabase uses Go Template syntax. Available variables:
- `{{ .ConfirmationURL }}` - The confirmation/action link
- `{{ .Token }}` - The confirmation token (if needed separately)
- `{{ .TokenHash }}` - Hashed token
- `{{ .SiteURL }}` - Your site URL
- `{{ .Email }}` - Recipient email address

## Styling

All templates use:
- Green gradient header (#10b981 to #059669)
- Clean white cards with subtle shadows
- Responsive design (max-width: 600px)
- Yellow security note boxes
- Consistent CTA button styling
- Professional footer with Ganamos branding

## Testing

After updating templates in Supabase:
1. Trigger a test email (sign up, password reset, etc.)
2. Check your inbox
3. Verify the styling renders correctly across different email clients
