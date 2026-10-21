-- ==============================================================================
-- BLITZ / Supabase Admins & Roles Script
-- Manages roles ('owner', 'editor', 'viewer') in public.admins.
-- Requires the corresponding user to already exist in auth.users (run user.sql
-- or add via Dashboard > Authentication > Users first).
-- Safe to re-run on both existing and new databases.
-- ==============================================================================

-- 1. Sync / Upsert desired admin roles from auth.users
with wanted (email, role) as (values
  ('aksh2425709@keshav.du.ac.in', 'owner')
  -- Add additional team members below:
  -- ('editor-email@keshav.du.ac.in', 'editor'),
  -- ('viewer-email@keshav.du.ac.in', 'viewer')
)
insert into public.admins (user_id, email, role)
select u.id, u.email, w.role
from auth.users u
join wanted w on lower(u.email) = lower(w.email)
on conflict (user_id) do update
  set role = excluded.role,
      email = excluded.email;

-- 2. Optional: Clean up any admins no longer in the allowed list
-- (Uncomment below if you want this script to strictly prune removed administrators)
-- delete from public.admins
-- where lower(email) not in (
--   lower('aksh2425709@keshav.du.ac.in')
-- );

-- 3. Show current active admins and roles
select a.user_id, a.email, a.role, a.created_at
from public.admins a
order by a.role, a.email;
