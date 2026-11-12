-- Схема бази даних для «ФІНАНСОВИЙ ШТОРМ: Ринок Активів» (Supabase Postgres + Realtime)
-- Виконайте цей SQL у Supabase Dashboard -> SQL Editor

create table if not exists public.game_rooms (
  id text primary key,
  state jsonb not null,
  version bigint not null default 1,
  updated_at timestamptz not null default now()
);

-- Увімкнути Realtime для таблиці game_rooms
alter table public.game_rooms replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'game_rooms'
  ) then
    alter publication supabase_realtime add table public.game_rooms;
  end if;
end $$;

-- Політики доступу (RLS) для швидкого запуску аудиторної гри
alter table public.game_rooms enable row level security;

drop policy if exists "Allow public read game_rooms" on public.game_rooms;
create policy "Allow public read game_rooms"
  on public.game_rooms for select
  using (true);

drop policy if exists "Allow public insert game_rooms" on public.game_rooms;
create policy "Allow public insert game_rooms"
  on public.game_rooms for insert
  with check (true);

drop policy if exists "Allow public update game_rooms" on public.game_rooms;
create policy "Allow public update game_rooms"
  on public.game_rooms for update
  using (true)
  with check (true);
