-- EXPOSED GAME - Esquema de base de datos
-- Ejecuta esto en el SQL Editor de tu proyecto Supabase

-- Tabla de salas
create table if not exists rooms (
  id uuid default gen_random_uuid() primary key,
  code text unique not null,
  host_session_id text not null,
  status text default 'waiting' check (status in ('waiting', 'playing', 'revealing', 'finished')),
  current_question_index int default 0,
  total_questions int default 10,
  mode text default 'principiante',
  created_at timestamp with time zone default now()
);

-- Tabla de jugadores
create table if not exists players (
  id uuid default gen_random_uuid() primary key,
  room_id uuid references rooms(id) on delete cascade not null,
  name text not null,
  is_manual boolean default false,
  session_id text,
  score int default 0,
  created_at timestamp with time zone default now()
);

-- Tabla de votos
create table if not exists votes (
  id uuid default gen_random_uuid() primary key,
  room_id uuid references rooms(id) on delete cascade not null,
  round int not null,
  voter_id uuid references players(id) on delete cascade not null,
  voted_for_id uuid references players(id) on delete cascade not null,
  created_at timestamp with time zone default now(),
  unique(room_id, round, voter_id)
);

-- Row Level Security
alter table rooms enable row level security;
alter table players enable row level security;
alter table votes enable row level security;

-- Políticas públicas (juego sin autenticación)
create policy "rooms_select" on rooms for select using (true);
create policy "rooms_insert" on rooms for insert with check (true);
create policy "rooms_update" on rooms for update using (true) with check (true);

create policy "players_select" on players for select using (true);
create policy "players_insert" on players for insert with check (true);
create policy "players_update" on players for update using (true) with check (true);
create policy "players_delete" on players for delete using (true);

create policy "votes_select" on votes for select using (true);
create policy "votes_insert" on votes for insert with check (true);

-- MIGRACIÓN (si ya tenías la tabla creada, ejecuta solo esto):
-- alter table rooms add column if not exists mode text default 'principiante';

-- Habilitar Realtime para las tablas
alter publication supabase_realtime add table rooms;
alter publication supabase_realtime add table players;
alter publication supabase_realtime add table votes;
