# Backend cutover (owner-run, in order)

Requires: `docs/SETUP.md` done (project, Twilio sender, Turnstile, URLs).
No local stack exists in this environment: everything below runs against
the real project, mostly once. Independent SQL review happens BEFORE step 1.

## 0. Review
- [ ] Hand `supabase/migrations/*.sql` to an independent reviewer.
- [ ] Reviewer checks: default-deny posture, column grants, trigger logic
      (forced owner, demo/service-role bypasses), definer `search_path` +
      revokes, public RPC minimal columns, bucket limits.

## 1. Apply migrations
Option A (CLI): `supabase db push` from the repo (needs a linked project).
Option B (dashboard): paste `0001`→`0006` into the SQL editor **in order**,
confirming each succeeds. `0006` demo rows are idempotent (`on conflict do nothing`).

## 2. Prove RLS (no code changes needed to run this)
```bash
SUPABASE_URL=https://xyz.supabase.co \
SUPABASE_ANON_KEY=<anon> \
SUPABASE_SERVICE_KEY=<service> \
  node tests/rls.js
```
Needs `SUPABASE_JWT_SECRET` too if the project does not use the legacy
service key as its JWT secret; or set `TEST_TOKEN_A/B/ADMIN` to real
session tokens instead of minted ones. Expect all-green; the script cleans
up its own rows. Any FAIL blocks cutover.

## 3. Seed the admin
```sql
-- run as service_role / SQL editor, AFTER the owner's first WhatsApp login
-- (their profile row is created by the auth.users trigger):
insert into public.admins (user_id)
select id from public.profiles where phone = '+212...owner...';
```

## 4. Flip the site
- [ ] `js/config.js`: `provider:'supabase'` + URL + anon key. Commit + deploy.
- [ ] Run `docs/FIRST-LIVE-TESTS.md` by hand, in order.

## 5. Media migration (one time, from the originating browser)
Legacy `data:`-URL photos re-upload to `business-media/{uid}/…` on first
save after cutover; `idb:` references that cannot be resolved locally are
dropped and reported in the owner dashboard. (No legacy users exist yet,
so this path is currently dormant by design.)

## Rollback
Static hosting: revert the `js/config.js` commit to return to mock/local.
Database writes before rollback stay where they are; the local app simply
stops reading them. No destructive step exists in cutover.
