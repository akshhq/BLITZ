-- Migration: remember each event image's shape (16:9, 5:4 or 4:5) so the Gallery can show portrait and landscape photos properly.
-- Run AFTER migration_event_images.sql (if you have not run that one yet, run it first, then this).
-- Safe to run more than once. Existing images become 16:9, which is how they were cropped. Nothing is dropped or deleted.
begin;

-- The picture's shape, chosen when it is cropped in the panel: wide 16:9 (the default), landscape 5:4 or portrait 4:5.
-- The Gallery uses it to size each card before the image has loaded, so nothing jumps while it lazy-loads.
alter table public.event_images add column if not exists aspect text not null default '16:9';
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.event_images'::regclass and conname = 'event_images_aspect_check') then
    alter table public.event_images add constraint event_images_aspect_check check (aspect in ('16:9', '5:4', '4:5'));
  end if;
end $$;


-- Replace an event's image list in ONE transaction. Items are { id?, image, alt? } in display order.
-- Existing ids keep their Gallery star (it is not part of this call); new ids start with the star OFF.
-- Client-generated ids make a retry idempotent. Runs as the caller, so row level security still applies.
create or replace function public.set_event_images(p_event_id text, p_images jsonb) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_item jsonb; v_pos integer := 0; v_id uuid; v_ids uuid[] := '{}'; v_aspect text;
begin
  if not public.can_edit() then raise exception 'not allowed' using errcode = '42501'; end if;
  if not exists (select 1 from public.events where id = p_event_id) then
    raise exception 'event % not found', p_event_id using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_images) is distinct from 'array' then raise exception 'images must be a list' using errcode = '22023'; end if;
  if jsonb_array_length(p_images) > 30 then raise exception 'an event can have at most 30 images' using errcode = '22023'; end if;

  for v_item in select value from jsonb_array_elements(p_images) loop
    v_pos := v_pos + 1;
    v_id := coalesce(nullif(v_item ->> 'id', '')::uuid, gen_random_uuid());
    if exists (select 1 from public.event_images where id = v_id and event_id <> p_event_id) then
      raise exception 'image id belongs to another event' using errcode = '42501';
    end if;
    v_ids := v_ids || v_id;
    v_aspect := nullif(v_item ->> 'aspect', '');
    insert into public.event_images (id, event_id, image, alt, aspect, sort_order)
    values (v_id, p_event_id, v_item ->> 'image', coalesce(v_item ->> 'alt', ''), coalesce(v_aspect, '16:9'), v_pos * 10)
    on conflict (id) do update
      set image = excluded.image, alt = excluded.alt, sort_order = excluded.sort_order,
          aspect = coalesce(v_aspect, public.event_images.aspect)          -- a caller that sends no shape never resets an existing one
      where (public.event_images.image, public.event_images.alt, public.event_images.sort_order, public.event_images.aspect)
            is distinct from (excluded.image, excluded.alt, excluded.sort_order, coalesce(v_aspect, public.event_images.aspect));
  end loop;

  delete from public.event_images where event_id = p_event_id and id <> all (v_ids);

  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'image', image, 'alt', alt, 'aspect', aspect,
                      'gallery_enabled', gallery_enabled, 'sort_order', sort_order) order by sort_order, created_at)
                   from public.event_images where event_id = p_event_id), '[]');
end $$;
revoke all on function public.set_event_images(text, jsonb) from public, anon;
grant execute on function public.set_event_images(text, jsonb) to authenticated;

create or replace function public.site_content() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'announcements', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.date desc nulls last, x.id)
      from (select id, title, date, summary, body, link from public.announcements where published) x), '[]'),
    'events', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.date desc nulls last, x.id)
      from (select e.id, e.title, e.date, e.time, e.location, e.description, e.category, e.layout, e.format, e.platform,
                   e.participants, e.speakers, e.key_points, e.winners, e.sessions, e.competition_sections,
                   e.links, e.image, e.image_alt, e.logo, e.brochure, e.event_details, e.placeholder, e.additional_info,
                   coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'image', i.image, 'alt', i.alt, 'aspect', i.aspect)
                                              order by i.sort_order, i.created_at)
                             from public.event_images i where i.event_id = e.id), '[]') as images
            from public.events e where e.published) x), '[]'),
    'team', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.sort_order, x.name)
      from (select id, name, position, tier, photo, sort_order from public.team_members where published) x), '[]'),
    -- Generated from event images: star on AND event published. Nothing is stored twice.
    'gallery', coalesce((
      select jsonb_agg(to_jsonb(g) order by g.sort_order)
      from (select i.id, e.title, i.alt as description, i.image,
                   coalesce(nullif(i.alt, ''), e.title) as alt, i.aspect, 'photo'::text as media_type,
                   coalesce(to_char(e.date, 'FMDD Mon YYYY'), '') as date_label, coalesce(e.location, '') as location,
                   (row_number() over (order by e.date desc nulls last, e.id, i.sort_order, i.created_at))::integer as sort_order
            from public.event_images i join public.events e on e.id = i.event_id
            where e.published and i.gallery_enabled and public.valid_image(i.image)) g), '[]'),
    'collaborations', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.sort_order, x.name)
      from (select id, name, type, logo, url, sort_order from public.collaborations where published) x), '[]'),
    'generated_at', now()
  );
$$;
revoke all on function public.site_content() from public;
grant execute on function public.site_content() to anon, authenticated;

commit;
notify pgrst, 'reload schema';
