-- Add owl to the allowed pet_type values for devices table

-- First drop the existing constraint
ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_pet_type_check;

-- Add the new constraint that includes 'owl'
ALTER TABLE devices ADD CONSTRAINT devices_pet_type_check 
  CHECK (pet_type IN ('cat', 'dog', 'rabbit', 'squirrel', 'turtle', 'owl'));

COMMENT ON COLUMN devices.pet_type IS 'The type of virtual pet: cat, dog, rabbit, squirrel, turtle, or owl';

