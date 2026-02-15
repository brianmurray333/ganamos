-- Add support for text-based tasks
-- This allows agents to complete tasks that don't require photo verification

-- Add task_type column to posts (default 'photo' for backward compatibility)
ALTER TABLE posts 
ADD COLUMN IF NOT EXISTS task_type TEXT NOT NULL DEFAULT 'photo' 
CHECK (task_type IN ('photo', 'text'));

-- Add submitted_fix_text column for text-based submissions
ALTER TABLE posts 
ADD COLUMN IF NOT EXISTS submitted_fix_text TEXT;

-- Add index for querying by task type
CREATE INDEX IF NOT EXISTS idx_posts_task_type ON posts(task_type);

-- Comment for documentation
COMMENT ON COLUMN posts.task_type IS 'Type of task: photo (requires image proof) or text (requires text response)';
COMMENT ON COLUMN posts.submitted_fix_text IS 'Text response for text-based task submissions';
