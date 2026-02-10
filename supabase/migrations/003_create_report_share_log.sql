-- Log each report share (recipient email, sharer verified email, business name)
-- Used for analytics and support; no PII beyond what is needed.

CREATE TABLE IF NOT EXISTS report_share_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Report that was shared (matches analysis_reports.report_id)
  report_id TEXT NOT NULL,

  -- Email address the report was sent to
  recipient_email TEXT NOT NULL,

  -- Verified email of the person who shared (from email_proof cookie), if any
  sharer_email TEXT,

  -- Business name from the report at time of share
  business_name TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_share_log_report_id ON report_share_log(report_id);
CREATE INDEX IF NOT EXISTS idx_report_share_log_created_at ON report_share_log(created_at DESC);

COMMENT ON TABLE report_share_log IS 'Log of report shares: recipient, sharer (verified email), and business name for each share';
