-- ==============================================================================
-- BLITZ / Supabase Migration: Add 'brochure' and 'logo' columns to public.events
-- Fixes: "Could not find the 'brochure' column of 'events' in the schema cache"
-- Safe to execute in Supabase SQL Editor.
-- ==============================================================================

begin;

-- 1. Add brochure and logo columns to public.events if they do not exist
alter table public.events add column if not exists brochure text;
alter table public.events add column if not exists logo text;

-- 2. Add validation constraint for brochure (HTTPS or assets/ path)
alter table public.events drop constraint if exists events_brochure_check;
alter table public.events add constraint events_brochure_check check (
  brochure is null or (
    brochure ~* '^https://[^[:space:]<>"'']+$' or
    brochure ~ '^assets/[A-Za-z0-9/_.-]{1,200}$'
  )
);

-- 3. Add validation constraint for logo (valid image: storage:... or assets/...)
alter table public.events drop constraint if exists events_logo_check;
alter table public.events add constraint events_logo_check check (
  public.valid_image(logo)
);

-- 4. Recreate the public events view to expose brochure and logo
create or replace view public.events_public as
  select id, title, date, time, location, description, category, layout,
         format, platform, participants, speakers, key_points, winners, sessions, competition_sections,
         links, image, image_alt, logo, brochure, event_details, placeholder, additional_info
  from public.events
  where published = true;

grant select on public.events_public to anon, authenticated;

-- 5. Recreate site_content RPC function to include logo and brochure
create or replace function public.site_content() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'announcements', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.date desc nulls last, x.id)
      from (select id, title, date, summary, body, link from public.announcements where published) x), '[]'),
    'events', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.date desc nulls last, x.id)
      from (select id, title, date, time, location, description, category, layout, format, platform,
                   participants, speakers, key_points, winners, sessions, competition_sections,
                   links, image, image_alt, logo, brochure, event_details, placeholder, additional_info
            from public.events where published) x), '[]'),
    'team', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.sort_order, x.name)
      from (select id, name, position, tier, photo, sort_order from public.team_members where published) x), '[]'),
    'gallery', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.sort_order, x.title)
      from (select id, title, description, image, alt, media_type, date_label, location, sort_order
            from public.gallery_items where published) x), '[]'),
    'collaborations', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.sort_order, x.name)
      from (select id, name, type, logo, url, sort_order from public.collaborations where published) x), '[]'),
    'generated_at', now()
  );
$$;

revoke all on function public.site_content() from public;
grant execute on function public.site_content() to anon, authenticated;

commit;

-- 6. Reload PostgREST schema cache immediately
notify pgrst, 'reload schema';
