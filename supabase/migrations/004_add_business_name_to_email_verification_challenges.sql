-- Add business_name to email_verification_challenges (optional, for context/support)
ALTER TABLE email_verification_challenges
  ADD COLUMN IF NOT EXISTS business_name TEXT;

COMMENT ON COLUMN email_verification_challenges.business_name IS 'Business/place name at time of verification request (e.g. for support or emails).';
