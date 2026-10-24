-- Migration: event images + Gallery generated from them.
-- Safe to run more than once. Never drops or truncates anything; public.gallery_items is kept as it is.
-- Run in the Supabase SQL Editor. See ERRORS.md ("Event images") for what to check afterwards.
begin;

-- ======================================================================================
-- Event images: one source of images (the images uploaded to events).
--   * public.event_images        every image attached to an event, in order, with its own Gallery star
--   * public.set_event_images()  replace an event's image list atomically (never touches the star)
--   * site_content()             gives each event its `images`, and builds `gallery` from
--                                star-enabled images of PUBLISHED events (nothing is copied)
-- public.gallery_items is legacy: it is kept (never dropped) but no longer feeds the website.
-- ======================================================================================
create table if not exists public.event_images (
  id              uuid primary key default gen_random_uuid(),
  event_id        text not null references public.events(id) on update cascade on delete cascade,
  image           text not null check (public.valid_image(image)),
  alt             text not null default '' check (char_length(alt) <= 300),
  gallery_enabled boolean not null default false,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid
);
create index if not exists event_images_event_idx on public.event_images (event_id, sort_order);

do $$
declare t text := 'event_images';
begin
  execute format('alter table public.%I enable row level security', t);
  execute format('revoke all on public.%I from anon, authenticated', t);
  execute format('grant select on public.%I to authenticated', t);
  execute format('grant insert, update, delete on public.%I to authenticated', t);
  execute format('drop policy if exists %I on public.%I', t || '_select', t);
  execute format('drop policy if exists %I on public.%I', t || '_insert', t);
  execute format('drop policy if exists %I on public.%I', t || '_update', t);
  execute format('drop policy if exists %I on public.%I', t || '_delete', t);
  execute format('create policy %I on public.%I for select to authenticated using (public.is_admin())', t || '_select', t);
  execute format('create policy %I on public.%I for insert to authenticated with check (public.can_edit())', t || '_insert', t);
  execute format('create policy %I on public.%I for update to authenticated using (public.can_edit()) with check (public.can_edit())', t || '_update', t);
  execute format('create policy %I on public.%I for delete to authenticated using (public.can_edit())', t || '_delete', t);
  execute format('drop trigger if exists trg_touch on public.%I', t);
  execute format('create trigger trg_touch before insert or update on public.%I for each row execute function public.touch_row()', t);
  execute format('drop trigger if exists trg_history on public.%I', t);
  execute format('create trigger trg_history after insert or update or delete on public.%I for each row execute function public.log_change()', t);
end $$;

-- Replace an event's image list in ONE transaction. Items are { id?, image, alt? } in display order.
-- Existing ids keep their Gallery star (it is not part of this call); new ids start with the star OFF.
-- Client-generated ids make a retry idempotent. Runs as the caller, so row level security still applies.
create or replace function public.set_event_images(p_event_id text, p_images jsonb) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_item jsonb; v_pos integer := 0; v_id uuid; v_ids uuid[] := '{}';
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
    insert into public.event_images (id, event_id, image, alt, sort_order)
    values (v_id, p_event_id, v_item ->> 'image', coalesce(v_item ->> 'alt', ''), v_pos * 10)
    on conflict (id) do update
      set image = excluded.image, alt = excluded.alt, sort_order = excluded.sort_order
      where (public.event_images.image, public.event_images.alt, public.event_images.sort_order)
            is distinct from (excluded.image, excluded.alt, excluded.sort_order);
  end loop;

  delete from public.event_images where event_id = p_event_id and id <> all (v_ids);

  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'image', image, 'alt', alt,
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
                   coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'image', i.image, 'alt', i.alt)
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
                   coalesce(nullif(i.alt, ''), e.title) as alt, 'photo'::text as media_type,
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

-- Existing single-image events keep working: their image becomes the event's first image (star off, as before).
insert into public.event_images (event_id, image, alt, sort_order)
select e.id, e.image, coalesce(e.image_alt, ''), 10
from public.events e
where e.image is not null and e.image <> '' and public.valid_image(e.image)
  and not exists (select 1 from public.event_images i where i.event_id = e.id);

-- Legacy Gallery photos that are exactly an event's image stay visible: turn that image's star on.
-- Nothing is deleted or copied. Other legacy items remain in public.gallery_items (see ERRORS.md).
update public.event_images i set gallery_enabled = true
where not i.gallery_enabled
  and exists (select 1 from public.gallery_items g where g.published and g.image = i.image);


commit;
notify pgrst, 'reload schema';
