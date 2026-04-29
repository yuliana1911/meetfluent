-- ── MeetFluent Beta Analytics ──────────────────────────────────────────────
-- Ejecuta esto en Supabase → SQL Editor → New Query → Run

-- Tabla 1: Feedback de usuarios (👍 / 👎 + comentario opcional)
create table if not exists feedback (
  id          uuid default gen_random_uuid() primary key,
  created_at  timestamptz default now(),
  rating      text not null check (rating in ('up', 'down')),
  comment     text,
  context     text,           -- de qué trató la reunión (anonimizado)
  ip_hash     text,           -- hash de IP, no IP directa
  user_agent  text
);

-- Tabla 2: Métricas de uso por sesión
create table if not exists usage_events (
  id            uuid default gen_random_uuid() primary key,
  created_at    timestamptz default now(),
  event_type    text not null,  -- 'suggestion_generated', 'suggestion_used', 'translation', 'meeting_ended', 'keyword_search'
  ip_hash       text,
  meeting_style text,
  english_level text,
  agenda_count  int,
  chat_length   int            -- cuántos mensajes tenía el chat
);

-- Habilitar Row Level Security (solo lectura pública, escritura desde el servidor)
alter table feedback      enable row level security;
alter table usage_events  enable row level security;

-- Política: el servidor (service role) puede insertar, nadie puede leer desde el cliente
create policy "server_insert_feedback"
  on feedback for insert
  with check (true);

create policy "server_insert_usage"
  on usage_events for insert
  with check (true);

-- Vista resumida útil para análisis
create or replace view feedback_summary as
select
  rating,
  count(*) as total,
  count(*) * 100.0 / sum(count(*)) over () as percentage
from feedback
group by rating;

create or replace view daily_usage as
select
  date_trunc('day', created_at) as day,
  event_type,
  count(*) as total
from usage_events
group by 1, 2
order by 1 desc, 2;
