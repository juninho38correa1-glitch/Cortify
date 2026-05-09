// ============================================
// CORTIFY - Edge Function: send-push
// ============================================
// Esta função roda no Supabase Edge Runtime (Deno).
// Ela é chamada pelo cron job e envia push notifications.
//
// Setup:
// 1. Gere as VAPID keys com: npx web-push generate-vapid-keys
// 2. Adicione nas Secrets do Supabase:
//    - VAPID_PUBLIC_KEY
//    - VAPID_PRIVATE_KEY
//    - VAPID_SUBJECT (mailto:seu@email.com)
// 3. Deploy: supabase functions deploy send-push
// ============================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as webpush from "https://esm.sh/web-push@3.6.7";

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')!;
const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')!;
const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@cortify.com.br';

webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ============================================
// Envia notificação pra todas as subscriptions de um usuário
// ============================================
async function sendToUser(userId: string, payload: any, type: string, refId?: string) {
  // Busca subscriptions
  const { data: subs } = await supabase
    .from('notification_subscriptions')
    .select('*')
    .eq('user_id', userId);

  if (!subs || subs.length === 0) {
    return { sent: 0, errors: 0 };
  }

  let sent = 0;
  let errors = 0;
  const errorMsgs: string[] = [];
  const expiredEndpoints: string[] = [];

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify(payload)
      );
      sent++;
    } catch (err: any) {
      errors++;
      errorMsgs.push(err.message);
      // Subscription expirada/inválida: remove
      if (err.statusCode === 410 || err.statusCode === 404) {
        expiredEndpoints.push(sub.endpoint);
      }
    }
  }

  // Limpa subscriptions inválidas
  if (expiredEndpoints.length > 0) {
    await supabase
      .from('notification_subscriptions')
      .delete()
      .in('endpoint', expiredEndpoints);
  }

  // Log
  await supabase.from('notification_log').insert({
    user_id: userId,
    type,
    ref_id: refId,
    title: payload.title,
    body: payload.body,
    success: sent > 0,
    error: errors > 0 ? errorMsgs.join(' | ').slice(0, 500) : null,
  });

  return { sent, errors };
}

// ============================================
// Processa lembretes de 15min antes
// ============================================
async function processLembretes15min() {
  const { data, error } = await supabase
    .from('notif_lembretes_pendentes')
    .select('*')
    .eq('user_quer_notif', true);

  if (error) {
    console.error('Erro ao buscar lembretes:', error);
    return 0;
  }

  let total = 0;
  for (const item of data || []) {
    const horario = new Date(item.inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const result = await sendToUser(
      item.user_id,
      {
        title: '🕐 Próximo cliente em 15 min',
        body: `${item.cliente_nome} · ${item.servico_nome} · ${horario}`,
        tag: 'lembrete-' + item.agendamento_id,
        data: { url: './app.html#agenda' },
      },
      'lembrete_15min',
      item.agendamento_id
    );
    if (result.sent > 0) total++;
  }
  return total;
}

// ============================================
// Processa pacotes acabando
// ============================================
async function processPacotesAcabando() {
  const { data, error } = await supabase
    .from('notif_pacotes_acabando')
    .select('*')
    .eq('user_quer_notif', true);

  if (error) {
    console.error('Erro ao buscar pacotes:', error);
    return 0;
  }

  let total = 0;
  for (const item of data || []) {
    const result = await sendToUser(
      item.user_id,
      {
        title: '📦 Pacote acabando',
        body: `${item.cliente_nome}: ${item.restantes} corte${item.restantes !== 1 ? 's' : ''} restante${item.restantes !== 1 ? 's' : ''}. Hora de oferecer renovação.`,
        tag: 'pacote-' + item.pacote_id,
        data: { url: './app.html#pacote-detail/' + item.pacote_id },
      },
      'pacote_acabando',
      item.pacote_id
    );
    if (result.sent > 0) total++;
  }
  return total;
}

// ============================================
// Trial acabando (3 dias e 1 dia antes)
// ============================================
async function processTrialAcabando() {
  const { data: prefs } = await supabase
    .from('notification_preferences')
    .select('user_id')
    .eq('notif_trial_acabando', true);

  const userIds = (prefs || []).map(p => p.user_id);
  if (userIds.length === 0) return 0;

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name, trial_ends_at')
    .in('id', userIds)
    .eq('subscription_status', 'TRIAL');

  let total = 0;
  for (const p of profiles || []) {
    if (!p.trial_ends_at) continue;
    const ms = new Date(p.trial_ends_at).getTime() - Date.now();
    const dias = Math.ceil(ms / (1000 * 60 * 60 * 24));

    if (dias === 3 || dias === 1) {
      // Verifica se já foi enviada hoje
      const { data: jaEnviada } = await supabase
        .from('notification_log')
        .select('id')
        .eq('user_id', p.id)
        .eq('type', `trial_acabando_${dias}d`)
        .gt('sent_at', new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString())
        .maybeSingle();

      if (jaEnviada) continue;

      const result = await sendToUser(
        p.id,
        {
          title: dias === 1 ? '⏰ Seu trial expira amanhã' : '⏰ Trial acabando',
          body: dias === 1
            ? 'Faça o PIX hoje pra não perder acesso ao Cortify.'
            : `Seu trial acaba em ${dias} dias. Considere ativar o plano pra continuar usando.`,
          tag: 'trial-' + dias,
          data: { url: './app.html#conta' },
        },
        `trial_acabando_${dias}d`,
        p.id
      );
      if (result.sent > 0) total++;
    }
  }
  return total;
}

// ============================================
// HTTP Handler
// ============================================
serve(async (req) => {
  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const action = body.action || 'all';

    const results: any = {};

    if (action === 'all' || action === 'lembretes') {
      results.lembretes = await processLembretes15min();
    }
    if (action === 'all' || action === 'pacotes') {
      results.pacotes = await processPacotesAcabando();
    }
    if (action === 'all' || action === 'trial') {
      results.trial = await processTrialAcabando();
    }

    // Permite enviar notificação manual (admin)
    if (action === 'manual' && body.user_id && body.payload) {
      results.manual = await sendToUser(body.user_id, body.payload, body.type || 'manual', body.ref_id);
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
