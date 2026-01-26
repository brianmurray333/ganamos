-- Drop the old atomic_claim_job function (7-param version)
-- This is needed before creating the new version with AI parameters
DROP FUNCTION IF EXISTS atomic_claim_job(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
