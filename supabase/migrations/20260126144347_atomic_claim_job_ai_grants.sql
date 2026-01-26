-- Grant permissions for atomic_claim_job function with AI parameters
-- The function signature changed to include p_ai_confidence and p_ai_analysis
-- This replaces the grants from the original migration since we dropped that function

-- Grant to authenticated users
GRANT EXECUTE ON FUNCTION atomic_claim_job(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT) TO authenticated;

-- Grant to service_role  
GRANT EXECUTE ON FUNCTION atomic_claim_job(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT) TO service_role;

-- Grant to anon (for anonymous submissions via web UI)
GRANT EXECUTE ON FUNCTION atomic_claim_job(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT) TO anon;
