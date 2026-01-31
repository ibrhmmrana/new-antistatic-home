-- Create analysis_reports table for storing shareable report snapshots
-- This table stores the full report snapshot that can be loaded by report_id

CREATE TABLE IF NOT EXISTS analysis_reports (
  -- Primary key: UUID auto-generated
  report_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Original scan ID (for traceability, not used for lookup)
  scan_id TEXT NOT NULL,
  
  -- Google Place ID
  place_id TEXT NOT NULL,
  
  -- Business info (denormalized for convenience)
  business_name TEXT,
  business_addr TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  
  -- The full report snapshot (ReportSnapshotV1)
  -- Contains everything needed to render the report without API calls
  report_payload JSONB NOT NULL,
  
  -- Legacy field for backwards compatibility (not used in new flow)
  source_payload JSONB
);

-- Index on scan_id for upsert operations (check if report exists for scan)
CREATE INDEX IF NOT EXISTS idx_analysis_reports_scan_id ON analysis_reports(scan_id);

-- Index on place_id for potential future queries by business
CREATE INDEX IF NOT EXISTS idx_analysis_reports_place_id ON analysis_reports(place_id);

-- Index on created_at for sorting/pagination
CREATE INDEX IF NOT EXISTS idx_analysis_reports_created_at ON analysis_reports(created_at DESC);

-- Comment on table
COMMENT ON TABLE analysis_reports IS 'Stores immutable report snapshots for shareable URLs (/r/[reportId])';
