# Ganamos - Community Issue Tracking & Rewards Platform

A platform for tracking and fixing community issues with Bitcoin Lightning Network rewards.

## Features

- 🗺️ Location-based issue reporting and tracking
- ⚡ Bitcoin Lightning Network integration for instant rewards
- 👨‍👩‍👧‍👦 Family account management (parent-child accounts)
- 🎯 Donation pools for boosting local issues
- 📱 Progressive Web App (PWA) support
- 🔐 Secure authentication via Supabase Auth
- 🤖 AI-powered fix verification

## Tech Stack

- **Frontend**: Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS
- **Backend**: Supabase (PostgreSQL), Row Level Security
- **Authentication**: Supabase Auth
- **Storage**: Supabase Storage
- **Payments**: Lightning Network (LND)
- **Maps**: Google Maps API, Leaflet
- **AI**: Groq API

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** 18+ and npm
- **Docker Desktop** - Required for local Supabase
  - Download from: https://docs.docker.com/desktop
  - Make sure Docker Desktop is running before starting development
- **Supabase CLI** - Installed via Homebrew (see setup below)

## Local Development Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd ganamos
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Start Docker Desktop

Ensure Docker Desktop is running on your machine. You can verify this by running:

```bash
docker --version
```

### 4. Start Local Supabase

Start the local Supabase instance (PostgreSQL, Auth, Storage, Realtime):

```bash
npm run supabase:start
```

This will:
- Pull necessary Docker images (first time only)
- Start PostgreSQL database on `localhost:54322`
- Start Supabase Studio on `localhost:54323`
- Start API server on `localhost:54321`
- Apply all migrations from `supabase/migrations/`
- Run seed data from `supabase/seed.sql`

The first time you run this, it may take a few minutes to download the Docker images.

**Local Supabase URLs:**
- API URL: `http://localhost:54321`
- Studio UI: `http://localhost:54323`
- Database: `postgresql://postgres:postgres@localhost:54322/postgres`

### 5. Configure Environment Variables

The `.env.local` file is already configured for local development. If you need to modify it:

```bash
# Supabase (Local)
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<provided-by-supabase-start>
SUPABASE_SECRET_API_KEY=<provided-by-supabase-start>
# Or use legacy key: SUPABASE_SERVICE_ROLE_KEY=<provided-by-supabase-start>

# Add your API keys
GOOGLE_MAPS_API_KEY=your-key
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your-key
COINMARKETCAP_API_KEY=your-key
GROQ_API_KEY=your-key
```

### 6. Start the Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:3457`

### 7. Access Supabase Studio

Open Supabase Studio to manage your local database:

```bash
npm run supabase:studio
```

Or navigate to: http://localhost:54323

## Available Scripts

### Development

- `npm run dev` - Start Next.js development server
- `npm run build` - Build for production
- `npm run start` - Start production server

### Supabase Commands

- `npm run supabase:start` - Start local Supabase
- `npm run supabase:stop` - Stop local Supabase
- `npm run supabase:restart` - Restart local Supabase
- `npm run supabase:status` - Check Supabase service status
- `npm run supabase:reset` - Reset database (reapply migrations + seed)
- `npm run supabase:studio` - Open Supabase Studio in browser
- `npm run supabase:migration` - Create a new migration file
- `npm run dev:local` - Start Supabase and Next.js together

### Testing

- `npm test` - Run all unit tests
- `npm run test:unit` - Run unit tests (mocked)
- `npm run test:integration` - Run integration tests (requires local Supabase)
- `npm run test:all` - Run unit + integration tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage report
- `npm run test:e2e` - Run Playwright e2e tests
- `npm run test:e2e:ui` - Run e2e tests with UI
- `npm run test:e2e:debug` - Debug e2e tests

## Database Management

### Creating Migrations

When you need to modify the database schema:

```bash
npm run supabase:migration add_new_feature
```

This creates a new migration file in `supabase/migrations/`. Edit the file to add your SQL changes.

### Applying Migrations

Migrations are automatically applied when you run `supabase start` or `supabase reset`.

To manually apply migrations:

```bash
npm run supabase:reset
```

### Viewing Migration Status

```bash
npm run supabase:status
```

### Seed Data

Sample seed data is located in `supabase/seed.sql`. This includes:
- Sample locations (Austin, NYC, San Francisco, Miami, Chicago)
- Donation pools for each location
- Bitcoin price data

To add more seed data, edit `supabase/seed.sql` and run:

```bash
npm run supabase:reset
```

## Project Structure

```
ganamos/
├── app/                    # Next.js app directory
│   ├── api/               # API routes
│   ├── (pages)/           # Page routes
│   └── layout.tsx         # Root layout
├── components/            # React components
├── lib/                   # Utility functions
│   ├── supabase.ts       # Supabase client setup
│   └── database.types.ts # TypeScript database types
├── supabase/             # Supabase configuration
│   ├── config.toml       # Supabase config
│   ├── migrations/       # Database migrations
│   └── seed.sql          # Seed data
├── scripts/              # Utility scripts
│   └── archive/          # Archived SQL files (historical)
├── tests/                # Test files
└── public/               # Static assets
```

## Database Schema

The application uses PostgreSQL with the following main tables:

- **profiles** - User profiles with balance and pet coins
- **posts** - Community issues/jobs to be fixed
- **transactions** - Financial transactions (deposits, withdrawals, transfers)
- **groups** - Community groups
- **group_members** - Group membership
- **connected_accounts** - Parent-child account relationships
- **donation_pools** - Location-based donation pools
- **donations** - User donations to pools
- **post_boosts** - Donation pool boosts applied to posts
- **activities** - Unified activity feed
- **devices** - Connected IoT hardware devices
- **bitcoin_prices** - Cached Bitcoin price data
- **location_hierarchy** - Geographic hierarchy data

## Authentication

The app uses Supabase Auth with support for:
- Email/password authentication
- Phone authentication
- Magic link authentication

Row Level Security (RLS) policies ensure users can only access their own data and public information.

## Lightning Network Integration

The app integrates with LND (Lightning Network Daemon) for Bitcoin payments:
- Instant deposits via Lightning invoices
- Instant withdrawals to Lightning wallets
- Internal transfers between users

Configure LND connection in `.env.local`:

```bash
LND_REST_URL=https://localhost:8080
LND_ADMIN_MACAROON=your-macaroon
```

## Troubleshooting

### Docker Not Running

If you see: `Cannot connect to the Docker daemon`

**Solution**: Start Docker Desktop and wait for it to fully initialize, then try again.

### Supabase Won't Start

If `supabase start` fails:

1. Check Docker is running: `docker ps`
2. Stop any existing containers: `npm run supabase:stop`
3. Restart: `npm run supabase:start`

### Port Already in Use

If ports 54321, 54322, or 54323 are in use:

1. Stop Supabase: `npm run supabase:stop`
2. Check what's using the port: `lsof -i :54321`
3. Kill the process or change Supabase port in `supabase/config.toml`

### Migration Errors

If migrations fail to apply:

1. Check the migration SQL syntax
2. Review the error message in the console
3. Fix the migration file
4. Reset: `npm run supabase:reset`

### Database Connection Issues

If the app can't connect to the database:

1. Verify Supabase is running: `npm run supabase:status`
2. Check `.env.local` has correct credentials
3. Restart both Supabase and Next.js

## Contributing

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Make your changes
3. Create migrations for database changes
4. Run tests: `npm test`
5. Run build to ensure it compiles: `npm run build`
6. Commit your changes
7. Push to your branch
8. Create a Pull Request

## License

[Your License Here]

## Support

For issues or questions:
- Open an issue on GitHub
- Check the troubleshooting section above
- Review Supabase docs: https://supabase.com/docs
