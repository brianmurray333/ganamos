-- Create activities table for unified activity feed
create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  type text not null, -- e.g. 'post', 'fix', 'reward', 'donation'
  related_id uuid, -- ID of the related entity (post, donation, etc.)
  related_table text, -- e.g. 'posts', 'donations'
  timestamp timestamptz not null default now(),
  metadata jsonb, -- Extra info (title, sats, etc.)
  created_at timestamptz not null default now()
);

create index if not exists activities_user_id_idx on activities(user_id);
create index if not exists activities_timestamp_idx on activities(timestamp desc); 