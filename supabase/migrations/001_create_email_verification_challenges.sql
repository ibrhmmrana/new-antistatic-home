-- Create email_verification_challenges table
CREATE TABLE IF NOT EXISTS email_verification_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed_at TIMESTAMPTZ,
  purpose TEXT NOT NULL DEFAULT 'unlock_report',
  place_id TEXT,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_email_verification_email_created ON email_verification_challenges(email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_verification_expires_at ON email_verification_challenges(expires_at);
CREATE INDEX IF NOT EXISTS idx_email_verification_place_id ON email_verification_challenges(place_id) WHERE place_id IS NOT NULL;

-- Enable Row Level Security
ALTER TABLE email_verification_challenges ENABLE ROW LEVEL SECURITY;

-- No client policies - server-only table
-- All access must go through server-side API routes

-- Add comment
COMMENT ON TABLE email_verification_challenges IS 'Stores email verification challenges for public analysis flow. Server-only access via RLS.';
