-- Add order_index for custom sorting
ALTER TABLE enhancement_presets 
ADD COLUMN IF NOT EXISTS order_index integer DEFAULT 0;

-- Create index for sorting
CREATE INDEX IF NOT EXISTS idx_presets_order_index ON enhancement_presets(order_index ASC);
