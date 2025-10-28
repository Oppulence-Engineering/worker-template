-- Migration: create scheduled job events audit table
-- Tracks execution metadata for scheduled jobs

create schema if not exists app;

create table if not exists app.scheduled_job_events (
  id bigserial primary key,
  job_key text not null,
  scheduled_at timestamptz not null,
  started_at timestamptz,
  completed_at timestamptz,
  status text not null check (status in ('scheduled', 'started', 'succeeded', 'failed')),
  error jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_scheduled_job_events_job_key on app.scheduled_job_events (job_key);
create index if not exists idx_scheduled_job_events_status on app.scheduled_job_events (status);
