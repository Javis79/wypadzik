-- Poprawki po przeglądzie: format loginu, spójność e-maila, wyścig przy opuszczaniu wypadu.

alter table public.profiles add constraint profiles_login_format check (login ~ '^[a-z0-9_.]{3,20}$');

create or replace function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare lg text; nm text;
begin
  lg := lower(trim(coalesce(new.raw_user_meta_data->>'login', split_part(coalesce(new.email, ''), '@', 1))));
  if lg !~ '^[a-z0-9_.]{3,20}$' then raise exception 'bad_login'; end if;
  if lower(coalesce(new.email, '')) <> lg || '@wypad.app' then raise exception 'bad_email'; end if;
  nm := left(trim(coalesce(new.raw_user_meta_data->>'name', '')), 40);
  if nm = '' then nm := lg; end if;
  insert into public.profiles (id, login, name) values (new.id, lg, nm);
  return new;
end;
$$;

create or replace function public.leave_trip(p_trip uuid) returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_member(p_trip) then raise exception 'not_member'; end if;
  -- blokada wiersza wypadu serializuje równoczesne wyjścia ostatnich osób
  perform 1 from public.trips where id = p_trip for update;
  delete from public.trip_members where trip_id = p_trip and user_id = auth.uid();
  if not exists (select 1 from public.trip_members where trip_id = p_trip) then
    delete from public.trips where id = p_trip;
  end if;
end;
$$;
