-- Add cloth_size and cloth_sizes_custom columns to employee_profiles table

-- Check if cloth_size column exists, if not add it
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'employee_profiles'
          AND column_name = 'cloth_size'
    ) THEN
        ALTER TABLE employee_profiles ADD COLUMN cloth_size VARCHAR(50) NULL;
    END IF;
END $$;

-- Check if cloth_sizes_custom column exists, if not add it
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'employee_profiles'
          AND column_name = 'cloth_sizes_custom'
    ) THEN
        ALTER TABLE employee_profiles ADD COLUMN cloth_sizes_custom JSON NULL;
    END IF;
END $$;

