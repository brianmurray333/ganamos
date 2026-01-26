-- Grant permissions for atomic_claim_job function
GRANT EXECUTE ON FUNCTION atomic_claim_job(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT) TO authenticated;
