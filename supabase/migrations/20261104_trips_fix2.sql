-- Techniczny e-mail kont: <login>@wypad.invalid zamiast <login>@wypad.app.
-- .invalid to domena zarezerwowana (RFC 2606): nikt jej nie kupi ani nie doda rekordów MX,
-- więc /recover ani /otp nie mogą wysłać linku do obcej skrzynki. Reszta funkcji bez zmian (20261104_trips_fix1.sql).

create or replace function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare lg text; nm text;
begin
  lg := lower(trim(coalesce(new.raw_user_meta_data->>'login', split_part(coalesce(new.email, ''), '@', 1))));
  if lg !~ '^[a-z0-9_.]{3,20}$' then raise exception 'bad_login'; end if;
  if lower(coalesce(new.email, '')) <> lg || '@wypad.invalid' then raise exception 'bad_email'; end if;
  nm := left(trim(coalesce(new.raw_user_meta_data->>'name', '')), 40);
  if nm = '' then nm := lg; end if;
  insert into public.profiles (id, login, name) values (new.id, lg, nm);
  return new;
end;
$$;
