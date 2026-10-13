delete from public.admins
where lower(email) <> lower('aksh2425709@keshav.du.ac.in');

do $$
begin
  if not exists (
    select 1
    from auth.users
    where lower(email) = lower('aksh2425709@keshav.du.ac.in')
  ) then
    raise exception 'Auth user aksh2425709@keshav.du.ac.in does not exist. Create it under Authentication > Users first.';
  end if;
end $$;

with wanted (email, role) as (values
  ('aksh2425709@keshav.du.ac.in', 'owner')
)
insert into public.admins (user_id, email, role)
select u.id, u.email, w.role
from auth.users u join wanted w on lower(u.email) = lower(w.email)
on conflict (user_id) do update set role = excluded.role, email = excluded.email;
select email, role from public.admins order by role, email;
