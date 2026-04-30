-- ============================================================
-- JVPLANNER v2 — Supabase Schema
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- ============================================================

-- EVENTS: unified table for all tasks/events across all tabs
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,

  title text not null,
  notes text default '',
  tab text not null check (tab in ('general', 'school', 'college')),

  -- Timing
  start_date date not null,
  start_time time,
  duration_minutes int default 0,

  -- Recurrence
  recurrence text default 'none' check (recurrence in ('none', 'daily', 'weekly', 'monthly')),
  recurrence_end date,

  -- State
  completed boolean default false,
  source text default 'manual' check (source in ('manual', 'canvas')),

  created_at timestamptz default now()
);

alter table events enable row level security;
create policy "users_own_events" on events
  for all using (auth.uid() = user_id);

-- COLLEGE MILESTONES: the spreadsheet tracker
create table if not exists college_milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,

  title text not null,
  track text not null,
  grade_year int not null check (grade_year in (9, 10, 11, 12)),
  status text default 'not-started' check (status in ('not-started', 'in-progress', 'done', 'applied')),
  deadline date,
  notes text default '',

  created_at timestamptz default now()
);

alter table college_milestones enable row level security;
create policy "users_own_milestones" on college_milestones
  for all using (auth.uid() = user_id);

-- Indexes for performance
create index if not exists events_user_date on events(user_id, start_date);
create index if not exists events_user_tab on events(user_id, tab);
create index if not exists milestones_user on college_milestones(user_id, grade_year);
