-- Grant permissions for atomic_claim_job function (original 7-param version)
-- Note: This function is later replaced by 20260126141420_atomic_claim_job_with_ai.sql
-- which drops this version and creates a new one with AI parameters
GRANT EXECUTE ON FUNCTION atomic_claim_job(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
