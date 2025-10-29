-- 0002_add_resolved_at_to_knowledge_gaps.sql
-- Add resolved_at column to knowledge_gaps to allow marking gaps as resolved
-- Run this in your Supabase SQL editor or with psql against your database.

ALTER TABLE public.knowledge_gaps
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

-- Optional index for queries filtering by resolved_at
CREATE INDEX IF NOT EXISTS idx_knowledge_gaps_resolved_at ON public.knowledge_gaps (resolved_at);
