create table if not exists public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  role       text not null default 'editor' check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid());
$$;
create or replace function public.can_edit() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.admins a
                 where a.user_id = auth.uid() and a.role in ('owner', 'editor'));
$$;
create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.admins a
                 where a.user_id = auth.uid() and a.role = 'owner');
$$;
revoke all on function public.is_admin(), public.can_edit(), public.is_owner() from public;
grant execute on function public.is_admin(), public.can_edit(), public.is_owner() to anon, authenticated;

revoke all on public.admins from anon, authenticated;
grant select on public.admins to authenticated;
drop policy if exists admins_read on public.admins;
create policy admins_read on public.admins for select to authenticated
  using (user_id = auth.uid() or public.is_owner());
create or replace function public.valid_image(p text) returns boolean
language sql immutable as $$
  select p is null or (p ~ '^(assets/|storage:)[A-Za-z0-9/_.-]{1,200}$' and p !~ '\.\.');
$$;

create or replace function public.valid_https(u text) returns boolean
language sql immutable as $$
  select u is null or (u ~* '^https://[^[:space:]<>"'']+$' and char_length(u) <= 1000);
$$;

create or replace function public.valid_json_list(j jsonb, max_items int) returns boolean
language sql immutable as $$
  select jsonb_typeof(j) = 'array' and jsonb_array_length(j) <= max_items and octet_length(j::text) <= 20000;
$$;

create or replace function public.valid_links(j jsonb) returns boolean
language sql immutable as $$
  select public.valid_json_list(j, 20) and not exists (
    select 1 from jsonb_array_elements(j) e
    where jsonb_typeof(e) <> 'object'
       or char_length(coalesce(e->>'label', '')) not between 1 and 100
       or not public.valid_https(e->>'url') or (e->>'url') is null);
$$;
create table if not exists public.announcements (
  id         text primary key check (id ~ '^[a-z0-9][a-z0-9-]{1,78}$'),
  title      text not null check (char_length(title) between 1 and 200),
  date       date,                               -- null = no date shown
  summary    text not null default '' check (char_length(summary) <= 500),
  body       text not null default '' check (char_length(body) <= 5000),
  link       text check (public.valid_https(link)),
  published  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table if not exists public.events (
  id                   text primary key check (id ~ '^[a-z0-9][a-z0-9-]{1,78}$'),
  title                text not null check (char_length(title) between 1 and 200),
  date                 date,                       -- null = "date to be confirmed"
  time                 text check (char_length(time) <= 60),
  location             text check (char_length(location) <= 200),
  description          text not null default '' check (char_length(description) between 0 and 2000),
  category             text not null check (char_length(category) between 1 and 80),
  layout               text not null default 'event'
                         check (layout in ('event', 'workshop', 'competition', 'festival', 'speaker')),
  format               text check (char_length(format) <= 120),
  platform             text check (char_length(platform) <= 80),
  participants         text check (char_length(participants) <= 80),
  speakers             text[] not null default '{}' check (cardinality(speakers) <= 30),
  key_points           text[] not null default '{}' check (cardinality(key_points) <= 30),
  winners              jsonb not null default '[]' check (public.valid_json_list(winners, 30)),
  sessions             jsonb not null default '[]' check (public.valid_json_list(sessions, 30)),
  competition_sections jsonb not null default '[]' check (public.valid_json_list(competition_sections, 30)),
  links                jsonb not null default '[]' check (public.valid_links(links)),
  image                text check (public.valid_image(image)),
  image_alt            text check (char_length(image_alt) <= 300),
  logo                 text check (public.valid_image(logo)),
  brochure             text check (brochure is null or (
                           brochure ~* '^https://[^[:space:]<>"'']+$' or
                           brochure ~ '^assets/[A-Za-z0-9/_.-]{1,200}$')),
  event_details        jsonb not null default '{}'::jsonb check (
                           jsonb_typeof(event_details) = 'object' and octet_length(event_details::text) <= 50000),
  placeholder          boolean not null default false,
  additional_info      text check (char_length(additional_info) <= 1500),
  published            boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  updated_by           uuid
);
alter table public.events drop constraint if exists events_description_check;
alter table public.events alter column description set default '';
alter table public.events add constraint events_description_check check (char_length(description) between 0 and 2000);
alter table public.events add column if not exists brochure text;
alter table public.events add column if not exists logo text;
alter table public.events add column if not exists event_details jsonb not null default '{}'::jsonb;
alter table public.events add column if not exists placeholder boolean not null default false;

create or replace view public.events_public as
  select id, title, date, time, location, description, category, layout,
         format, platform, participants, speakers, key_points, winners, sessions, competition_sections,
         links, image, image_alt, logo, brochure, event_details, placeholder, additional_info
  from public.events
  where published = true;
grant select on public.events_public to anon, authenticated;

create table if not exists public.team_members (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 120),
  position   text not null check (char_length(position) between 1 and 120),
  tier       text not null check (tier in ('faculty', 'core', 'senior', 'junior', 'volunteer')),
  photo      text check (public.valid_image(photo)),
  sort_order integer not null default 0,
  published  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table if not exists public.gallery_items (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 200),
  description text check (char_length(description) <= 500),
  image       text not null check (public.valid_image(image)),
  alt         text check (char_length(alt) <= 300),
  media_type  text not null default 'photo' check (media_type in ('photo', 'illustration')),
  date_label  text check (char_length(date_label) <= 60),     -- free text, e.g. "Aug 2026"
  location    text check (char_length(location) <= 200),
  sort_order  integer not null default 0,
  published   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

create table if not exists public.collaborations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 160),
  type       text not null check (char_length(type) between 1 and 120),
  logo       text check (public.valid_image(logo)),
  url        text check (public.valid_https(url)),
  sort_order integer not null default 0,
  published  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create table if not exists public.content_history (
  id         bigint generated always as identity primary key,
  table_name text not null,
  row_pk     text not null,
  op         text not null check (op in ('INSERT', 'UPDATE', 'DELETE')),
  old_row    jsonb,
  new_row    jsonb,
  changed_by uuid,
  changed_at timestamptz not null default now()
);
create index if not exists content_history_changed_at_idx on public.content_history (changed_at desc);
alter table public.content_history enable row level security;
revoke all on public.content_history from anon, authenticated;
grant select on public.content_history to authenticated;
drop policy if exists history_read on public.content_history;
create policy history_read on public.content_history for select to authenticated
  using (public.is_admin());

create or replace function public.touch_row() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id then
      raise exception 'id cannot be changed';
    end if;
    new.created_at := old.created_at;
  else
    new.created_at := now();
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();   -- never trust a client-supplied value
  return new;
end $$;

create or replace function public.log_change() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    insert into public.content_history (table_name, row_pk, op, old_row, changed_by)
      values (tg_table_name, to_jsonb(old) ->> 'id', 'DELETE', to_jsonb(old), auth.uid());
  elsif tg_op = 'UPDATE' then
    insert into public.content_history (table_name, row_pk, op, old_row, new_row, changed_by)
      values (tg_table_name, to_jsonb(new) ->> 'id', 'UPDATE', to_jsonb(old), to_jsonb(new), auth.uid());
  else
    insert into public.content_history (table_name, row_pk, op, new_row, changed_by)
      values (tg_table_name, to_jsonb(new) ->> 'id', 'INSERT', to_jsonb(new), auth.uid());
  end if;
  delete from public.content_history where id in
    (select id from public.content_history where changed_at < now() - interval '365 days' limit 20);
  return null;
end $$;
do $$
declare t text;
begin
  foreach t in array array['announcements', 'events', 'team_members', 'gallery_items', 'collaborations'] loop
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
  end loop;
end $$;

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

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = true, file_size_limit = 2097152,
      allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png'];

-- Storage object privileges are separate from storage RLS policies. Keep the
-- bucket public for website delivery, but only let authenticated admins use
-- the browser upload client.
grant usage on schema storage to authenticated;
grant select, insert, update, delete on storage.objects to authenticated;

drop policy if exists media_select on storage.objects;
drop policy if exists media_insert on storage.objects;
drop policy if exists media_update on storage.objects;
drop policy if exists media_delete on storage.objects;
create policy media_select on storage.objects for select to authenticated
  using (bucket_id = 'media' and public.is_admin());
create policy media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.can_edit());
create policy media_update on storage.objects for update to authenticated
  using (bucket_id = 'media' and public.can_edit()) with check (bucket_id = 'media' and public.can_edit());
create policy media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media' and public.can_edit());

-- Force PostgREST to reload schema cache
notify pgrst, 'reload schema';

