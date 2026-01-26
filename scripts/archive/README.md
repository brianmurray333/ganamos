# Archived SQL Migration Files

This directory contains the original 53 SQL migration files that were used before migrating to Supabase CLI.

## Why These Are Archived

These files were manually executed in the Supabase SQL Editor during development. With the transition to local Supabase development using the Supabase CLI, all schema definitions have been consolidated into proper migration files located in `supabase/migrations/`.

## Historical Reference

These files are kept for:
- Historical reference and documentation
- Understanding the evolution of the schema
- Debugging purposes if needed
- Reference for custom functions and RLS policies

## Current Migration System

All new database changes should be made using the Supabase CLI:

```bash
# Create a new migration
supabase migration new <description>

# Apply migrations locally
supabase db reset

# Push migrations to remote (when ready)
supabase db push
```

## File Categories

- **Table Creation**: `create-*-table.sql`
- **Schema Modifications**: `add-*.sql`
- **RLS Policies**: `fix-*-rls*.sql`, `secure-*.sql`, `update-*-policy.sql`
- **Functions**: `create-*-function.sql`
- **Data Fixes**: `fix-*.sql`, `backfill-*.sql`
- **Debugging Scripts**: `check-*.sql`, `diagnose-*.sql`, `investigate-*.sql`, `verify-*.sql`

Do not execute these files directly. They have been consolidated into the initial schema migration.
