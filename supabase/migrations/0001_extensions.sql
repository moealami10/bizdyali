-- 0001: Extensions. Run first.
create extension if not exists "pgcrypto";  -- gen_random_uuid()
create extension if not exists "citext";    -- case-insensitive slug uniqueness
