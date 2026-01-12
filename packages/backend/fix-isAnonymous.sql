-- Fix isAnonymous column for better-auth anonymous plugin
DO $$ 
BEGIN
    -- Rename from is_anonymous if it exists
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user' AND column_name = 'is_anonymous') THEN
        ALTER TABLE "user" RENAME COLUMN is_anonymous TO "isAnonymous";
        RAISE NOTICE 'Renamed is_anonymous to isAnonymous';
    -- Create if it doesn't exist
    ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user' AND column_name = 'isAnonymous') THEN
        ALTER TABLE "user" ADD COLUMN "isAnonymous" BOOLEAN NOT NULL DEFAULT false;
        RAISE NOTICE 'Created isAnonymous column';
    ELSE
        RAISE NOTICE 'isAnonymous column already exists';
    END IF;
END $$;
