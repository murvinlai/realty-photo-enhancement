-- Add new columns for Preset Management features

ALTER TABLE enhancement_presets 
ADD COLUMN IF NOT EXISTS is_favorite boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS usage_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_used_at timestamp with time zone;

-- Index for sorting performance
CREATE INDEX IF NOT EXISTS idx_presets_usage_count ON enhancement_presets(usage_count DESC);
CREATE INDEX IF NOT EXISTS idx_presets_last_used_at ON enhancement_presets(last_used_at DESC);
