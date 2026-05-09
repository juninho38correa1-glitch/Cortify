-- ============================================
-- CORTIFY - Schema Push Notifications (FASE 2)
-- ============================================
-- Rode este SQL no SQL Editor do Supabase
-- ============================================

-- 1. Tabela de subscriptions (cada device do usuário)
create table if not exists public.notification_subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamp with time zone default now() not null,
  last_used_at timestamp with time zone default now() not null
);

create index if not exists idx_notif_subs_user on public.notification_subscriptions(user_id);

alter table public.notification_subscriptions enable row level security;

drop policy if exists "Users see own subscriptions" on public.notification_subscriptions;
create policy "Users see own subscriptions" on public.notification_subscriptions
  for all using (auth.uid() = user_id);


-- 2. Preferências de notificação por usuário
create table if not exists public.notification_preferences (
  user_id uuid references public.profiles(id) on delete cascade primary key,
  notif_lembrete_15min boolean default true not null,
  notif_pacote_acabando boolean default true not null,
  notif_pagamento_recebido boolean default true not null,
  notif_trial_acabando boolean default true not null,
  notif_aniversariantes boolean default true not null,
  notif_clientes_inativos boolean default false not null,
  updated_at timestamp with time zone default now() not null
);

alter table public.notification_preferences enable row level security;

drop policy if exists "Users manage own prefs" on public.notification_preferences;
create policy "Users manage own prefs" on public.notification_preferences
  for all using (auth.uid() = user_id);


-- 3. Log de notificações enviadas (pra evitar enviar duplicado)
create table if not exists public.notification_log (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  type text not null, -- 'lembrete_15min', 'pacote_acabando', etc
  ref_id uuid, -- id do agendamento/pacote/etc relacionado
  title text,
  body text,
  sent_at timestamp with time zone default now() not null,
  success boolean default true,
  error text
);

create index if not exists idx_notif_log_user on public.notification_log(user_id);
create index if not exists idx_notif_log_ref on public.notification_log(type, ref_id);
create index if not exists idx_notif_log_sent on public.notification_log(sent_at desc);

alter table public.notification_log enable row level security;

drop policy if exists "Users see own logs" on public.notification_log;
create policy "Users see own logs" on public.notification_log
  for select using (auth.uid() = user_id or public.is_admin());


-- ============================================
-- 4. View: agendamentos prontos pra lembrar (15 min antes)
-- ============================================
create or replace view public.notif_lembretes_pendentes as
select
  a.id as agendamento_id,
  a.user_id,
  a.cliente_id,
  c.nome as cliente_nome,
  s.nome as servico_nome,
  a.inicio,
  prefs.notif_lembrete_15min as user_quer_notif
from public.agendamentos a
left join public.clientes c on c.id = a.cliente_id
left join public.servicos s on s.id = a.servico_id
left join public.notification_preferences prefs on prefs.user_id = a.user_id
where a.status = 'AGENDADO'
  and a.inicio >= now() + interval '14 minutes'
  and a.inicio <= now() + interval '16 minutes'
  -- não enviar se já foi enviada
  and not exists (
    select 1 from public.notification_log nl
    where nl.type = 'lembrete_15min'
      and nl.ref_id = a.id
      and nl.success = true
  );


-- ============================================
-- 5. View: pacotes acabando (1 ou 0 cortes restantes)
-- ============================================
create or replace view public.notif_pacotes_acabando as
select
  p.id as pacote_id,
  p.user_id,
  p.cliente_id,
  c.nome as cliente_nome,
  p.nome as pacote_nome,
  sum(pi.quantidade_total - pi.quantidade_usada) as restantes,
  prefs.notif_pacote_acabando as user_quer_notif
from public.pacotes p
left join public.clientes c on c.id = p.cliente_id
left join public.pacote_itens pi on pi.pacote_id = p.id
left join public.notification_preferences prefs on prefs.user_id = p.user_id
where p.status = 'ATIVO'
group by p.id, p.user_id, p.cliente_id, c.nome, p.nome, prefs.notif_pacote_acabando
having sum(pi.quantidade_total - pi.quantidade_usada) <= 1
   and sum(pi.quantidade_total - pi.quantidade_usada) > 0
   and not exists (
     select 1 from public.notification_log nl
     where nl.type = 'pacote_acabando'
       and nl.ref_id = p.id
       and nl.success = true
       and nl.sent_at > now() - interval '7 days'  -- só uma vez por semana por pacote
   );


-- ============================================
-- DONE
-- ============================================
-- Próximos passos:
-- 1. Configure as VAPID keys nas Secrets do Supabase
-- 2. Crie a Edge Function 'send-push'
-- 3. Configure o cron job pra rodar a cada 5 minutos
