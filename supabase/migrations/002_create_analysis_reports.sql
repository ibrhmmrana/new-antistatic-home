-- Persisted shareable reports (one row per scan_id; upsert by scan_id).
-- report_payload: assembled report JSON for UI. source_payload: optional raw analyzer outputs (no base64).
CREATE TABLE IF NOT EXISTS analysis_reports (
  report_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id text NOT NULL UNIQUE,
  place_id text NOT NULL,
  business_name text,
  business_addr text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  report_version int NOT NULL DEFAULT 1,
  report_payload jsonb NOT NULL,
  source_payload jsonb,
  is_public boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_analysis_reports_place_id ON analysis_reports(place_id);
-- scan_id already unique; unique index implied by UNIQUE constraint

COMMENT ON TABLE analysis_reports IS 'Persisted final reports for shareable /r/[reportId] URLs. Server-only access via service role.';
