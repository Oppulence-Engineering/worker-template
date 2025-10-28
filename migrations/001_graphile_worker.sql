-- Migration: Initialize Graphile Worker
-- This migration sets up the Graphile Worker schema and tables
-- For more information, see: https://worker.graphile.org/

-- Ensure anonymous web role exists for PostGraphile
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'web_anon'
  ) THEN
    CREATE ROLE web_anon NOLOGIN;
  END IF;
END;
$$;

-- Allow the app user to SET ROLE to web_anon
GRANT web_anon TO postgres;

-- Create Graphile Worker schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS graphile_worker;

-- Note: Graphile Worker will create its own tables automatically
-- when the worker starts for the first time. This migration file
-- is a placeholder for future custom tables or extensions.

-- Example: Add custom job metadata table (optional)
CREATE TABLE IF NOT EXISTS public.job_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id TEXT NOT NULL,
  job_name TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add index for job lookups
CREATE INDEX IF NOT EXISTS idx_job_metadata_job_id ON public.job_metadata(job_id);
CREATE INDEX IF NOT EXISTS idx_job_metadata_job_name ON public.job_metadata(job_name);

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_job_metadata_updated_at
  BEFORE UPDATE ON public.job_metadata
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions (adjust as needed for your setup)
-- GRANT USAGE ON SCHEMA graphile_worker TO your_worker_user;
-- GRANT ALL ON ALL TABLES IN SCHEMA graphile_worker TO your_worker_user;
-- GRANT ALL ON ALL SEQUENCES IN SCHEMA graphile_worker TO your_worker_user;

COMMENT ON SCHEMA graphile_worker IS 'Schema for Graphile Worker job queue';
COMMENT ON TABLE public.job_metadata IS 'Custom metadata for job tracking and analytics';
