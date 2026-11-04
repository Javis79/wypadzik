-- Konta, wiele wypadów, członkowie, zaproszenia. wypad_items / wypad_pull / wypad_push zostają bez zmian.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  login text not null unique check (login = lower(login)),
  name text not null default ''
);

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  start_date date,
  end_date date,
  origin text not null default 'KRK',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.trip_members (
  trip_id uuid not null references public.trips (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);
create index trip_members_user_idx on public.trip_members (user_id);

create table public.trip_invites (
  token text primary key,
  trip_id uuid not null references public.trips (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null default now() + interval '14 days'
);
create index trip_invites_trip_idx on public.trip_invites (trip_id);

create table public.trip_items (
  trip_id uuid not null references public.trips (id) on delete cascade,
  key text not null,
  value jsonb,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (trip_id, key)
);
create index trip_items_updated_idx on public.trip_items (trip_id, updated_at);

alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.trip_invites enable row level security;
alter table public.trip_items enable row level security;

-- Tabele: zero domyślnych uprawnień, potem tylko to, co potrzebne.
revoke all on public.profiles, public.trips, public.trip_members, public.trip_invites, public.trip_items from anon, authenticated;
grant select on public.profiles, public.trips, public.trip_members to authenticated;
grant update (name) on public.profiles to authenticated;

create function public.is_member(p_trip uuid) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.trip_members m
    where m.trip_id = p_trip and m.user_id = auth.uid()
  );
$$;

create policy profiles_select on public.profiles for select to authenticated using (true);
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy trips_select on public.trips for select to authenticated using (public.is_member(id));
create policy trip_members_select on public.trip_members for select to authenticated using (public.is_member(trip_id));
-- trip_items i trip_invites: bez polityk, tylko przez funkcje.

-- Profil z metadanych rejestracji.
create function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, login, name)
  values (
    new.id,
    lower(trim(coalesce(new.raw_user_meta_data->>'login', split_part(new.email, '@', 1)))),
    trim(coalesce(new.raw_user_meta_data->>'name', ''))
  );
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.create_trip(p_title text, p_start date, p_end date, p_origin text)
  returns public.trips
  language plpgsql security definer set search_path = ''
as $$
declare t public.trips;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  insert into public.trips (title, start_date, end_date, origin, created_by)
  values (left(trim(coalesce(p_title, '')), 120), p_start, p_end,
          coalesce(nullif(upper(trim(p_origin)), ''), 'KRK'), auth.uid())
  returning * into t;
  insert into public.trip_members (trip_id, user_id) values (t.id, auth.uid());
  return t;
end;
$$;

create function public.add_member(p_trip uuid, p_login text) returns public.profiles
  language plpgsql security definer set search_path = ''
as $$
declare p public.profiles;
begin
  if not public.is_member(p_trip) then raise exception 'not_member'; end if;
  select * into p from public.profiles where login = lower(trim(p_login));
  if not found then raise exception 'no_such_login'; end if;
  insert into public.trip_members (trip_id, user_id) values (p_trip, p.id)
  on conflict do nothing;
  return p;
end;
$$;

create function public.create_invite(p_trip uuid) returns text
  language plpgsql security definer set search_path = ''
as $$
declare tok text;
begin
  if not public.is_member(p_trip) then raise exception 'not_member'; end if;
  tok := translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_');
  insert into public.trip_invites (token, trip_id, created_by)
  values (tok, p_trip, auth.uid());
  return tok;
end;
$$;

create function public.accept_invite(p_token text) returns uuid
  language plpgsql security definer set search_path = ''
as $$
declare tid uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select trip_id into tid from public.trip_invites
  where token = p_token and expires_at > now();
  if tid is null then raise exception 'invite_expired'; end if;
  insert into public.trip_members (trip_id, user_id) values (tid, auth.uid())
  on conflict do nothing;
  return tid;
end;
$$;

create function public.update_trip(p_trip uuid, p_title text, p_start date, p_end date, p_origin text)
  returns public.trips
  language plpgsql security definer set search_path = ''
as $$
declare t public.trips;
begin
  if not public.is_member(p_trip) then raise exception 'not_member'; end if;
  update public.trips
  set title = left(trim(coalesce(p_title, '')), 120),
      start_date = p_start,
      end_date = p_end,
      origin = coalesce(nullif(upper(trim(p_origin)), ''), 'KRK')
  where id = p_trip
  returning * into t;
  return t;
end;
$$;

create function public.leave_trip(p_trip uuid) returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_member(p_trip) then raise exception 'not_member'; end if;
  delete from public.trip_members where trip_id = p_trip and user_id = auth.uid();
  -- ostatnia osoba wychodzi: wypad znika razem z danymi
  if not exists (select 1 from public.trip_members where trip_id = p_trip) then
    delete from public.trips where id = p_trip;
  end if;
end;
$$;

create function public.delete_trip(p_trip uuid) returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_member(p_trip) then raise exception 'not_member'; end if;
  if not exists (select 1 from public.trips where id = p_trip and created_by = auth.uid()) then
    raise exception 'not_owner';
  end if;
  delete from public.trips where id = p_trip;
end;
$$;

create function public.trip_push(p_trip uuid, p_items jsonb)
  returns table(key text, updated_at timestamptz)
  language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_member(p_trip) then raise exception 'not_member'; end if;
  if jsonb_typeof(p_items) <> 'object' or (select count(*) from jsonb_object_keys(p_items)) > 2000 then
    raise exception 'bad items';
  end if;
  return query
  insert into public.trip_items as t (trip_id, key, value, updated_at)
  select p_trip, e.key, nullif(e.value, 'null'::jsonb), clock_timestamp()
  from jsonb_each(p_items) e
  where length(e.key) <= 200 and pg_column_size(e.value) < 200000
  on conflict (trip_id, key) do update
    set value = excluded.value, updated_at = excluded.updated_at
  returning t.key, t.updated_at;
end;
$$;

create function public.trip_pull(p_trip uuid, p_since timestamptz default null)
  returns table(key text, value jsonb, updated_at timestamptz)
  language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_member(p_trip) then raise exception 'not_member'; end if;
  return query
  select i.key, i.value, i.updated_at
  from public.trip_items i
  where i.trip_id = p_trip
    and (p_since is null or i.updated_at > p_since)
  order by i.updated_at
  limit 5000;
end;
$$;

-- Wywoływane z tokenem użytkownika; widoczność załatwia RLS (security invoker).
create function public.my_trips()
  returns table(id uuid, title text, start_date date, end_date date, origin text, created_by uuid, members jsonb)
  language sql stable security invoker set search_path = ''
as $$
  select t.id, t.title, t.start_date, t.end_date, t.origin, t.created_by,
         coalesce((
           select jsonb_agg(jsonb_build_object('id', p.id, 'login', p.login, 'name', p.name) order by m.joined_at)
           from public.trip_members m join public.profiles p on p.id = m.user_id
           where m.trip_id = t.id
         ), '[]'::jsonb)
  from public.trips t
  order by t.start_date nulls last, t.created_at;
$$;

create function public.find_profiles(p_q text) returns setof public.profiles
  language sql stable security invoker set search_path = ''
as $$
  with q as (
    select replace(replace(replace(lower(trim(p_q)), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat
  )
  select p.* from public.profiles p, q
  where length(trim(coalesce(p_q, ''))) > 0
    and (p.login like q.pat or lower(p.name) like q.pat)
  order by p.login
  limit 8;
$$;

-- Wykonanie tylko dla zalogowanych (wypad_* zostają nietknięte).
revoke execute on function
  public.is_member(uuid), public.handle_new_user(),
  public.create_trip(text, date, date, text), public.add_member(uuid, text),
  public.create_invite(uuid), public.accept_invite(text),
  public.update_trip(uuid, text, date, date, text), public.leave_trip(uuid),
  public.delete_trip(uuid), public.trip_push(uuid, jsonb),
  public.trip_pull(uuid, timestamptz), public.my_trips(), public.find_profiles(text)
from public, anon;
revoke execute on function public.handle_new_user() from authenticated;
