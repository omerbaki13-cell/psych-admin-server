-- Supabase > SQL Editor'a yapistirip "Run" de.
-- Duyuru gonderirken hata aliyorsan sebebi genelde:
--   1) tablo/kolon yok  2) RLS acik ve insert engelleniyor

create table if not exists public.announcement (
  id                bigserial primary key,
  message           text not null,
  announcement_date timestamptz not null default now()
);

create table if not exists public.scores (
  player      text primary key,
  points      integer not null default 0,
  last_played timestamptz
);

create table if not exists public.users (
  username text primary key,
  password text not null
);

-- Eksik kolon varsa tamamla (eski tablolar icin)
alter table public.announcement add column if not exists message text;
alter table public.announcement add column if not exists announcement_date timestamptz default now();

-- ---------------------------------------------------------------
-- RLS: sunucu service_role key kullaniyorsa RLS'i zaten bypass eder.
-- Ama yanlislikla ANON key kullaniyorsan insert "row-level security
-- policy" hatasi verir. Cozum: dogru key'i kullan (onerilen) VEYA
-- asagidaki policy'leri ac.
-- ---------------------------------------------------------------

alter table public.announcement enable row level security;
alter table public.scores       enable row level security;
alter table public.users        enable row level security;

drop policy if exists "service_role full access" on public.announcement;
create policy "service_role full access" on public.announcement
  for all to service_role using (true) with check (true);

drop policy if exists "service_role full access" on public.scores;
create policy "service_role full access" on public.scores
  for all to service_role using (true) with check (true);

drop policy if exists "service_role full access" on public.users;
create policy "service_role full access" on public.users
  for all to service_role using (true) with check (true);
