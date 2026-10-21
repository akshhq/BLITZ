-- ==============================================================================
-- BLITZ / Supabase Auth User Creation Script
-- Creates auth users directly in auth.users if they do not exist yet.
-- Generates secure encrypted password hashes using pgcrypto.
-- Safe to re-run on existing and new databases.
-- ==============================================================================

-- Enable pgcrypto in extensions schema (default for Supabase)
create extension if not exists pgcrypto with schema extensions;

do $$
declare
  target_email text := 'aksh2425709@keshav.du.ac.in';
  target_password text := 'u^R6#3U'; -- Temporary password. Update/change after first login!
  target_role text := 'owner'; -- Role: 'owner', 'editor', or 'viewer'
  user_id_val uuid;
  encrypted_pw text;
begin
  -- 1. Check if user already exists in auth.users
  select id into user_id_val from auth.users where lower(email) = lower(target_email);

  if user_id_val is not null then
    raise notice 'Auth user % already exists (id: %). Skipping creation.', target_email, user_id_val;
  else
    user_id_val := gen_random_uuid();
    encrypted_pw := extensions.crypt(target_password, extensions.gen_salt('bf'));

    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      recovery_sent_at,
      last_sign_in_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000',
      user_id_val,
      'authenticated',
      'authenticated',
      lower(target_email),
      encrypted_pw,
      now(), -- Auto confirms email
      null,
      null,
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      now(),
      now(),
      '',
      '',
      '',
      ''
    );

    -- Also insert into auth.identities so Supabase Auth handles email sign-in properly
    insert into auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    ) values (
      user_id_val,
      user_id_val,
      jsonb_build_object('sub', user_id_val::text, 'email', lower(target_email)),
      'email',
      lower(target_email),
      null,
      now(),
      now()
    );

    raise notice 'Created auth user % with temporary password.', target_email;
  end if;

  -- 2. Assign / update admin role in public.admins
  insert into public.admins (user_id, email, role)
  values (user_id_val, lower(target_email), target_role)
  on conflict (user_id) do update
    set role = excluded.role,
        email = excluded.email;

  raise notice 'Assigned role "%" to % in public.admins.', target_role, target_email;
end $$;

-- Verify admin account and role
select a.user_id, a.email, a.role, a.created_at
from public.admins a
where lower(a.email) = lower('aksh2425709@keshav.du.ac.in');
