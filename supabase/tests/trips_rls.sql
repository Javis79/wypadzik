-- Test RLS i funkcji wypadów. Uruchom w jednym wywołaniu; na końcu rollback.
begin;

insert into auth.users (id, email, raw_user_meta_data)
values (gen_random_uuid(), 't_ala@wypad.app', '{"login":"t_ala","name":"Ala"}'),
       (gen_random_uuid(), 't_ola@wypad.app', '{"login":"t_ola","name":"Ola"}'),
       (gen_random_uuid(), 't_ewa@wypad.app', '{"login":"t_ewa","name":"Ewa"}');

do $$
declare msg text;
begin
  begin insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), 't_zly@wypad.app', '{"login":"t_inny","name":"X"}'); msg := 'brak błędu';
  exception when others then msg := sqlerrm; end;
  assert msg = 'bad_email', 'login/email niezgodne: ' || msg;
  begin insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), 'ab@wypad.app', '{"login":"ab","name":"X"}'); msg := 'brak błędu';
  exception when others then msg := sqlerrm; end;
  assert msg = 'bad_login', 'za krótki login: ' || msg;
  begin insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), 't_a b@wypad.app', '{"login":"t_a b","name":"X"}'); msg := 'brak błędu';
  exception when others then msg := sqlerrm; end;
  assert msg = 'bad_login', 'login ze spacją: ' || msg;
  begin insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), 't_ąla@wypad.app', '{"login":"t_ąla","name":"X"}'); msg := 'brak błędu';
  exception when others then msg := sqlerrm; end;
  assert msg = 'bad_login', 'login z Unicode: ' || msg;
  begin insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), 't_obcy@gmail.com', '{"login":"t_obcy","name":"X"}'); msg := 'brak błędu';
  exception when others then msg := sqlerrm; end;
  assert msg = 'bad_email', 'obca domena: ' || msg;
  begin insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), 't_dluga_nazwa_loginu_xx@wypad.app', '{"login":"t_dluga_nazwa_loginu_xx"}'); msg := 'brak błędu';
  exception when others then msg := sqlerrm; end;
  assert msg = 'bad_login', 'za długi login: ' || msg;
end $$;

do $$
declare
  ala uuid; ola uuid; ewa uuid; trip uuid; n int; tok text; msg text; r record;
begin
  select id into ala from public.profiles where login = 't_ala';
  select id into ola from public.profiles where login = 't_ola';
  select id into ewa from public.profiles where login = 't_ewa';
  assert ala is not null and ola is not null and ewa is not null, 'trigger profiles nie zadziałał';
  perform set_config('t.ala', ala::text, true);
  perform set_config('t.ola', ola::text, true);
  perform set_config('t.ewa', ewa::text, true);
end $$;

set local role authenticated;

-- ala tworzy wypad
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.ala'))::text, true);
do $$
declare trip uuid; n int; m int;
begin
  select id into trip from public.create_trip('Test', date '2026-11-19', date '2026-11-24', 'KRK');
  perform set_config('t.trip', trip::text, true);
  select count(*), max(jsonb_array_length(members)) into n, m from public.my_trips() where id = trip;
  assert n = 1 and m = 1, 'my_trips ala: ' || n || '/' || m;
  perform public.trip_push(trip, '{"cfg":{"a":1},"d:x":{"b":2}}'::jsonb);
  select count(*) into n from public.trip_pull(trip, null);
  assert n = 2, 'trip_pull ala po push: ' || n;
  -- tombstone: null zostaje jako wiersz
  perform public.trip_push(trip, '{"d:x":null}'::jsonb);
  select count(*) into n from public.trip_pull(trip, null) where value is null;
  assert n = 1, 'tombstone';
end $$;

-- ola: nic nie widzi
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.ola'))::text, true);
do $$
declare trip uuid := current_setting('t.trip')::uuid; n int; msg text;
begin
  select count(*) into n from public.my_trips();
  assert n = 0, 'ola widzi cudzy wypad w my_trips';
  select count(*) into n from public.trips;
  assert n = 0, 'ola widzi trips przez RLS';
  select count(*) into n from public.trip_members;
  assert n = 0, 'ola widzi trip_members przez RLS';
  begin perform 1 from public.trip_items; msg := 'brak błędu';
  exception when insufficient_privilege then msg := 'denied'; end;
  assert msg = 'denied', 'trip_items dostępne bezpośrednio: ' || msg;
  begin perform * from public.trip_pull(trip, null); msg := 'brak błędu';
  exception when others then msg := sqlerrm; end;
  assert msg = 'not_member', 'trip_pull: ' || msg;
  begin perform * from public.trip_push(trip, '{"x":1}'::jsonb); msg := 'brak błędu';
  exception when others then msg := sqlerrm; end;
  assert msg = 'not_member', 'trip_push: ' || msg;
  begin perform public.create_invite(trip); msg := 'brak błędu';
  exception when others then msg := sqlerrm; end;
  assert msg = 'not_member', 'create_invite: ' || msg;
  begin perform public.add_member(trip, 't_ewa'); msg := 'brak błędu';
  exception when others then msg := sqlerrm; end;
  assert msg = 'not_member', 'add_member: ' || msg;
  begin perform public.update_trip(trip, 'X', null, null, 'KRK'); msg := 'brak błędu';
  exception when others then msg := sqlerrm; end;
  assert msg = 'not_member', 'update_trip: ' || msg;
end $$;

-- ala dodaje olę z nieuporządkowanym loginem
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.ala'))::text, true);
do $$
declare trip uuid := current_setting('t.trip')::uuid; msg text; p public.profiles; n int;
begin
  p := public.add_member(trip, 'T_Ola ');
  assert p.login = 't_ola', 'add_member zwrócił ' || coalesce(p.login, 'null');
  begin perform public.add_member(trip, 'nie_ma_takiego'); msg := 'brak błędu';
  exception when others then msg := sqlerrm; end;
  assert msg = 'no_such_login', 'add_member brak loginu: ' || msg;
  -- ponowne dodanie nie wywala
  perform public.add_member(trip, 't_ola');
  select count(*) into n from public.find_profiles('t_');
  assert n = 3, 'find_profiles: ' || n;
end $$;

-- zaproszenie: token zapisany do późniejszego użycia
do $$
declare trip uuid := current_setting('t.trip')::uuid; tok text;
begin
  tok := public.create_invite(trip);
  assert length(tok) = 24, 'długość tokenu ' || length(tok);
  perform set_config('t.tok', tok, true);
end $$;

-- ola widzi wypad z 2 członkami, może pushować, aktualizować, ale nie usuwać
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.ola'))::text, true);
do $$
declare trip uuid := current_setting('t.trip')::uuid; n int; m int; msg text; t public.trips;
begin
  select count(*), max(jsonb_array_length(members)) into n, m from public.my_trips() where id = trip;
  assert n = 1 and m = 2, 'my_trips ola: ' || n || '/' || m;
  select count(*) into n from public.trip_pull(trip, null);
  assert n = 2, 'trip_pull ola: ' || n;
  t := public.update_trip(trip, 'Nowy tytuł', date '2026-11-20', date '2026-11-25', 'WMI');
  assert t.title = 'Nowy tytuł' and t.origin = 'WMI', 'update_trip';
  begin perform public.delete_trip(trip); msg := 'brak błędu';
  exception when others then msg := sqlerrm; end;
  assert msg = 'not_owner', 'delete_trip: ' || msg;
end $$;

-- ewa przyjmuje zaproszenie; wygasłe zaproszenie daje invite_expired
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.ewa'))::text, true);
do $$
declare trip uuid := current_setting('t.trip')::uuid; id uuid; msg text; n int;
begin
  begin perform public.accept_invite('zly_token'); msg := 'brak błędu';
  exception when others then msg := sqlerrm; end;
  assert msg = 'invite_expired', 'zły token: ' || msg;
end $$;

reset role;
update public.trip_invites set expires_at = now() - interval '1 day' where token = current_setting('t.tok');
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.ewa'))::text, true);
do $$
declare msg text; n int;
begin
  begin perform public.accept_invite(current_setting('t.tok')); msg := 'brak błędu';
  exception when others then msg := sqlerrm; end;
  assert msg = 'invite_expired', 'wygasły token: ' || msg;
  select count(*) into n from public.my_trips();
  assert n = 0, 'ewa nie powinna być członkiem po wygasłym zaproszeniu';
end $$;

-- świeże zaproszenie działa
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.ala'))::text, true);
do $$
begin perform set_config('t.tok2', public.create_invite(current_setting('t.trip')::uuid), true); end $$;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.ewa'))::text, true);
do $$
declare id uuid; n int;
begin
  id := public.accept_invite(current_setting('t.tok2'));
  assert id = current_setting('t.trip')::uuid, 'accept_invite zwrócił zły id';
  select count(*) into n from public.my_trips();
  assert n = 1, 'ewa nie widzi wypadu po accept_invite';
  -- ewa opuszcza wypad
  perform public.leave_trip(id);
  select count(*) into n from public.my_trips();
  assert n = 0, 'leave_trip';
end $$;

-- anon nie może wywołać funkcji; profil: update tylko własnego
reset role;
do $$
declare n int; msg text;
begin
  assert not has_function_privilege('anon', 'public.trip_pull(uuid,timestamptz)', 'execute'), 'anon ma execute na trip_pull';
  assert not has_function_privilege('anon', 'public.create_trip(text,date,date,text)', 'execute'), 'anon ma execute na create_trip';
  assert has_function_privilege('authenticated', 'public.trip_pull(uuid,timestamptz)', 'execute'), 'authenticated bez execute';
end $$;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.ola'))::text, true);
do $$
declare n int;
begin
  update public.profiles set name = 'Hack' where login = 't_ala';
  get diagnostics n = row_count;
  assert n = 0, 'ola zmieniła cudzy profil';
  update public.profiles set name = 'Ola2' where login = 't_ola';
  get diagnostics n = row_count;
  assert n = 1, 'ola nie może zmienić swojego profilu';
end $$;

-- ala usuwa wypad
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.ala'))::text, true);
do $$
declare n int;
begin
  perform public.delete_trip(current_setting('t.trip')::uuid);
  select count(*) into n from public.my_trips();
  assert n = 0, 'delete_trip przez właściciela';
end $$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.ewa'))::text, true);
do $$
declare t public.trips;
begin
  t := public.create_trip('Sam', null, null, 'KRK');
  perform set_config('t.trip2', t.id::text, true);
  perform public.leave_trip(t.id);
end $$;

reset role;
do $$ begin
  assert (select count(*) from public.trips where id = current_setting('t.trip2')::uuid) = 0, 'wypad nie zniknął po wyjściu ostatniej osoby';
  assert (select count(*) from public.trip_members where trip_id = current_setting('t.trip2')::uuid) = 0, 'członkowie zostali';
end $$;

rollback;
