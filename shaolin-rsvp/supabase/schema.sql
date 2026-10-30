-- =====================================================================
--  Shaolin Kung Fu · RSVP  —  esquema de base de datos (Supabase / Postgres)
--  Pégalo entero en: Supabase Dashboard → SQL Editor → New query → Run
--  Es idempotente: puedes ejecutarlo varias veces sin romper nada.
-- =====================================================================

-- 1) Tabla principal -----------------------------------------------------
create table if not exists public.rsvps (
  id                   uuid primary key default gen_random_uuid(),
  created_at           timestamptz not null default now(),   -- fecha del primer registro
  updated_at           timestamptz not null default now(),   -- última vez que cambió su respuesta
  full_name            text        not null check (char_length(full_name) between 2 and 80),
  email                text        unique                     -- OPCIONAL; si existe, una respuesta por correo
                       check (email = lower(email) and char_length(email) <= 254),
  status               text        not null check (status in ('attending', 'not_attending')),
  message              text                 check (message is null or char_length(message) <= 500),
  confirmation_sent_at timestamptz                            -- cuándo se envió el email de confirmación
);

-- Si la tabla ya existía con email obligatorio, esto lo vuelve opcional (idempotente).
-- Postgres permite varias filas con email NULL aunque la columna sea unique.
alter table public.rsvps alter column email drop not null;

comment on table  public.rsvps        is 'Respuestas RSVP del evento Shaolin Kung Fu';
comment on column public.rsvps.status is 'attending = Asistirá · not_attending = No asistirá';

create index if not exists rsvps_status_created_idx on public.rsvps (status, created_at);

-- 2) updated_at automático -----------------------------------------------
create or replace function public.rsvps_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists rsvps_touch_updated_at on public.rsvps;
create trigger rsvps_touch_updated_at
  before update on public.rsvps
  for each row execute function public.rsvps_touch_updated_at();

-- 3) Seguridad (RLS) -----------------------------------------------------
-- Con RLS activado y SIN políticas, la clave pública (anon) no puede leer ni
-- escribir la tabla directamente. Así los correos nunca quedan expuestos.
-- Solo la Edge Function (service_role) escribe; la web lee vía la función de abajo.
alter table public.rsvps enable row level security;

-- 4) Lectura pública SOLO de nombre + estado (sin email ni notas) --------
create or replace function public.get_rsvp_list()
returns table (full_name text, status text, created_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select r.full_name, r.status, r.created_at
  from public.rsvps r
  order by r.created_at asc;
$$;

revoke all on function public.get_rsvp_list() from public;
grant execute on function public.get_rsvp_list() to anon, authenticated;

-- 5) Datos del evento editables desde Supabase (Table Editor) -------------
--  event_sessions : una fila por día/hora  (puedes tener 1, 2, 3… sesiones)
--  event_notes    : una fila por precio o aviso (kind = 'price' o 'reminder')
--  `sort` ordena las filas (1, 2, 3…). Edita, añade o borra filas y la web y el email se actualizan solos.
create table if not exists public.event_sessions (
  id    bigint generated always as identity primary key,
  sort  int  not null default 0,
  day   text not null,   -- p. ej. "Thursday 5 November"
  hours text not null    -- p. ej. "12:00 – 13:00"
);

create table if not exists public.event_notes (
  id    bigint generated always as identity primary key,
  sort  int  not null default 0,
  kind  text not null check (kind in ('price', 'reminder')),
  text  text not null
);

alter table public.event_sessions enable row level security;
alter table public.event_notes    enable row level security;

-- Datos iniciales (solo si las tablas están vacías)
insert into public.event_sessions (sort, day, hours)
select * from (values
  (1, 'Thursday 5 November', '12:00 – 13:00'),
  (2, 'Saturday 7 November', '17:00 – 18:00')
) as v(sort, day, hours)
where not exists (select 1 from public.event_sessions);

insert into public.event_notes (sort, kind, text)
select * from (values
  (1, 'price',    'Two introductory lessons free'),
  (2, 'price',    '20 Fr for every next lesson'),
  (1, 'reminder', 'Black long pants and black shirt'),
  (2, 'reminder', 'Clean shoes for the room'),
  (3, 'reminder', 'Parking is hard'),
  (4, 'reminder', 'Class starts on time')
) as v(sort, kind, text)
where not exists (select 1 from public.event_notes);

-- Lectura pública (la web la usa; el email la lee con la service_role)
create or replace function public.get_event_info()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'sessions',  coalesce((select jsonb_agg(jsonb_build_object('day', day, 'hours', hours) order by sort, id) from public.event_sessions), '[]'::jsonb),
    'price',     coalesce((select jsonb_agg(text order by sort, id) from public.event_notes where kind = 'price'), '[]'::jsonb),
    'reminders', coalesce((select jsonb_agg(text order by sort, id) from public.event_notes where kind = 'reminder'), '[]'::jsonb)
  );
$$;

revoke all on function public.get_event_info() from public;
grant execute on function public.get_event_info() to anon, authenticated;

-- 6) Consultas útiles para ti (organizador) ------------------------------
-- Ver todo (Table Editor también sirve):
--   select * from public.rsvps order by created_at;
-- Contadores:
--   select status, count(*) from public.rsvps group by status;
-- Exportar lista de asistentes con correo (en el SQL Editor: botón "Download CSV"):
--   select full_name, email, message, created_at from public.rsvps where status = 'attending' order by created_at;
