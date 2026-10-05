-- 0002: Core tables. No access granted here (see 0003); RPCs live in 0004.
-- All security-definer functions in later migrations use fixed search_path
-- and are revoked from PUBLIC/anon except where explicitly granted.

-- Login identity. Rows are created ONLY by the handle_new_user() trigger on
-- auth.users (phone comes from the verified OTP session, never the client).
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  phone text not null unique,            -- E.164, set by trigger only
  name text not null default '',
  created_at timestamptz not null default now()
);
comment on table public.profiles is 'Private owner profiles. Never exposed by public_business().';

-- Platform admins. No client access at all; only is_admin() reads this.
create table public.admins (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
comment on table public.admins is 'Inserted manually via SQL by the project owner. Phase 3 replaces the local allowlist.';

-- Businesses. owner_id / trial / subscription / suspended are server-owned:
-- column grants (0003) plus the force_business_owner trigger enforce that.
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  -- null ONLY for is_demo seed rows (no auth user exists at seed time).
  -- NULL never satisfies owner_id = auth.uid(), so demos are unreadable
  -- to owners and untouchable through every owner policy.
  owner_id uuid references public.profiles (id) on delete cascade,
  slug citext not null unique,
  name text not null,
  category text not null default '',
  description text not null default '',
  phone text not null default '',
  whatsapp text not null default '',     -- intentionally public storefront field
  address text not null default '',
  city text not null default '',
  hours text not null default '',
  facebook text not null default '',
  instagram text not null default '',
  offering_type text not null default 'both',
  logo text not null default '',
  cover text not null default '',
  items jsonb not null default '[]',
  theme jsonb not null default '{}',
  hours_week jsonb,
  testimonials jsonb not null default '[]',
  trust jsonb not null default '[]',
  published boolean not null default false,
  trial_start timestamptz,
  trial_end timestamptz,
  subscription text not null default 'none',  -- 'none' | 'active'
  suspended boolean not null default false,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint businesses_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint businesses_slug_not_reserved check (slug not in ('admin', 'api', 'auth', 'login', 'dashboard', 'create', 'index', 'terms', 'privacy'))
);
comment on column public.businesses.whatsapp is 'Public storefront contact field. The login phone lives in private profiles.';

-- Owner drafts (amendment 5): one row per owner, jsonb payload.
-- Client syncs with a localStorage write-through buffer (instant load,
-- offline); server wins ties on login. Implemented client-side after review.
create table public.drafts (
  owner_id uuid primary key references public.profiles (id) on delete cascade,
  data jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- Activity log. Insert-only through server functions; admins read.
create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  ts timestamptz not null default now(),
  type text not null,
  actor text not null,                    -- 'owner' | 'admin' | 'system'
  actor_name text not null default '',
  business_id uuid,
  business_name text not null default '',
  owner_id uuid,
  details text not null default ''
);

-- updated_at maintenance.
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path to public as $$
begin new.updated_at = now(); return new; end $$;
create trigger businesses_touch before update on public.businesses
  for each row execute function public.touch_updated_at();
create trigger drafts_touch before update on public.drafts
  for each row execute function public.touch_updated_at();
