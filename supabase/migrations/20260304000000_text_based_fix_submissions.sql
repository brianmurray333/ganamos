-- Support text-based fix submissions for image-less posts
-- Fixers can now submit proof as text (URLs, descriptions) in addition to or instead of images

ALTER TABLE posts ADD COLUMN IF NOT EXISTS submitted_fix_proof_text TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS fix_proof_text TEXT;

-- Drop the old 9-parameter version to avoid overload ambiguity
DROP FUNCTION IF EXISTS atomic_claim_job(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT);
