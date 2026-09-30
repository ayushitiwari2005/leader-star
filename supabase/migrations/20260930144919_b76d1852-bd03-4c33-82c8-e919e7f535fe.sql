CREATE UNIQUE INDEX IF NOT EXISTS teams_name_lower_key ON public.teams (lower(btrim(name)));
ALTER TABLE public.scores ADD CONSTRAINT scores_points_nonnegative CHECK (points >= 0);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON public.audit_logs (entity_type, created_at DESC);