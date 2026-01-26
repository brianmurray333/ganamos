-- Grant anon permission for atomic_claim_job with AI parameters (for anonymous web submissions)
GRANT EXECUTE ON FUNCTION atomic_claim_job(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT) TO anon;
