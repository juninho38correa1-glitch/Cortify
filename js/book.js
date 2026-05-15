// ============================================
// CORTIFY - Página Pública de Agendamento
// Adaptado pro book.html que está no Vercel
// ============================================

const state = {
  slug: null,
  barber: null,
  servicos: [],
  servicoSelecionado: null,
  dataSelecionada: null,
  horarioSelecionado: null,
  agendamentos: [],
  blocks: [],
  agendamentoConfirmado: null,
};

const SLOT_MIN = 30;
const DIAS_FUTURO = 14;

// ========== UTILS ==========
function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatBRL(n) {
  return 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',');
}

function pad(n) { return String(n).padStart(2, '0'); }

function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.style.cssText = `background:${type === 'error' ? '#3a1a1a' : type === 'success' ? '#1a3a25' : '#1a1a1a'};color:#fff;padding:12px 18px;border-radius:10px;margin-top:8px;border:1px solid ${type === 'error' ? '#e07474' : type === 'success' ? '#6fcf97' : '#333'};font-size:13px;box-shadow:0 4px 12px rgba(0,0,0,0.3);position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:9999`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function setSafe(id, value, prop = 'textContent') {
  const el = document.getElementById(id);
  if (el) el[prop] = value;
}

// ========== INICIALIZAÇÃO ==========
(async function init() {
  const params = new URLSearchParams(window.location.search);
  state.slug = params.get('b');

  if (!state.slug) {
    showInactive();
    return;
  }

  const sb = window.supabase.createClient(
    window.SUPABASE_CONFIG.url,
    window.SUPABASE_CONFIG.anonKey
  );
  window.sb = sb;

  try {
    await loadBarber();
    await loadServicos();
    await loadAgendamentos();
    showContent();
  } catch (err) {
    console.error(err);
    showInactive();
  }
})();

function showContent() {
  const loading = document.getElementById('loadingScreen');
  const content = document.getElementById('contentScreen');
  if (loading) loading.style.display = 'none';
  if (content) content.style.display = 'block';
}

function showInactive() {
  const loading = document.getElementById('loadingScreen');
  const content = document.getElementById('contentScreen');
  const success = document.getElementById('successScreen');
  const inactive = document.getElementById('inactiveScreen');
  if (loading) loading.style.display = 'none';
  if (content) content.style.display = 'none';
  if (success) success.style.display = 'none';
  if (inactive) inactive.style.display = 'block';
}

function showSuccess() {
  const content = document.getElementById('contentScreen');
  const success = document.getElementById('successScreen');
  if (content) content.style.display = 'none';
  if (success) success.style.display = 'block';

  const ag = state.agendamentoConfirmado;
  const dataStr = ag.inicio.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  const horaStr = ag.inicio.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  setSafe('confirmCliente', ag.cliente_nome);
  setSafe('confirmServico', ag.servico.nome);
  setSafe('confirmData', dataStr);
  setSafe('confirmHorario', horaStr);

  // Link WhatsApp pro barbeiro
  const phone = (state.barber.phone || '').replace(/\D/g, '');
  const link = document.getElementById('whatsAppConfirm');
  if (phone && link) {
    const msg = `Olá ${state.barber.name.split(' ')[0]}! Acabei de agendar pelo seu link:\n\n📅 ${dataStr} às ${horaStr}\n✂️ ${ag.servico.nome}\n\nMeu nome: ${ag.cliente_nome}`;
    link.href = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  } else if (link) {
    link.style.display = 'none';
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ========== CARREGA DADOS DO BARBEIRO ==========
async function loadBarber() {
  const { data, error } = await sb
    .from('profiles')
    .select('id, name, barbershop_name, slug, public_bio, work_schedule, phone')
    .eq('slug', state.slug)
    .eq('public_page_active', true)
    .maybeSingle();

  if (error || !data) {
    throw new Error('Barbeiro não encontrado');
  }

  state.barber = data;

  const initials = (data.name || '?').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
  setSafe('barberAvatar', initials);
  setSafe('barberName', data.name || '');
  setSafe('barbershopName', data.barbershop_name || '');

  const bio = document.getElementById('barberBio');
  if (bio) {
    if (data.public_bio) {
      bio.textContent = data.public_bio;
      bio.style.display = 'block';
    } else {
      bio.style.display = 'none';
    }
  }

  document.title = `Agendar com ${data.name} · Cortify`;
}

// ========== CARREGA SERVIÇOS ==========
async function loadServicos() {
  const { data, error } = await sb
    .from('servicos')
    .select('id, nome, preco, duracao_min')
    .eq('user_id', state.barber.id)
    .eq('ativo', true)
    .order('preco');

  if (error) throw error;

  state.servicos = data || [];
  renderServicos();
}

function renderServicos() {
  const container = document.getElementById('servicosList');
  if (!container) return;

  if (state.servicos.length === 0) {
    container.innerHTML = `<div class="horarios-empty">Esse barbeiro ainda não cadastrou serviços.</div>`;
    return;
  }

  container.innerHTML = state.servicos.map(s => `
    <div class="servico-row" data-id="${s.id}" onclick="selecionarServico('${s.id}')">
      <div class="servico-radio"></div>
      <div class="servico-info">
        <div class="servico-nome">${escapeHtml(s.nome)}</div>
        <div class="servico-meta">${s.duracao_min} min</div>
      </div>
      <div class="servico-preco">${formatBRL(s.preco)}</div>
    </div>
  `).join('');
}

function selecionarServico(id) {
  state.servicoSelecionado = state.servicos.find(s => s.id === id);
  state.dataSelecionada = null;
  state.horarioSelecionado = null;

  document.querySelectorAll('.servico-row').forEach(el => {
    el.classList.toggle('selected', el.dataset.id === id);
  });

  document.getElementById('step2').style.display = 'block';
  document.getElementById('step3').style.display = 'none';
  document.getElementById('step4').style.display = 'none';

  renderDates();

  setTimeout(() => {
    document.getElementById('step2').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

// ========== CARREGA AGENDAMENTOS EXISTENTES ==========
async function loadAgendamentos() {
  const inicio = new Date();
  inicio.setHours(0, 0, 0, 0);
  const fim = new Date(inicio);
  fim.setDate(fim.getDate() + DIAS_FUTURO);

  const [agRes, blockRes] = await Promise.all([
    sb.from('agendamentos')
      .select('inicio, fim, status')
      .eq('user_id', state.barber.id)
      .gte('inicio', inicio.toISOString())
      .lte('inicio', fim.toISOString())
      .not('status', 'in', '(CANCELADO,FALTOU)'),

    sb.from('schedule_blocks')
      .select('inicio, fim')
      .eq('user_id', state.barber.id)
      .gte('fim', inicio.toISOString())
  ]);

  state.agendamentos = agRes.data || [];
  state.blocks = blockRes.data || [];
}

// ========== DATAS ==========
function renderDates() {
  const container = document.getElementById('datesList');
  if (!container) return;

  const dias = [];
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  for (let i = 0; i < DIAS_FUTURO; i++) {
    const d = new Date(hoje);
    d.setDate(d.getDate() + i);
    dias.push(d);
  }

  const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  container.innerHTML = dias.map(d => {
    const diaSem = d.getDay();
    const work = state.barber.work_schedule?.[String(diaSem)];
    const ativo = work && work.active;
    const isoDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    return `
      <button class="date-btn ${!ativo ? 'disabled' : ''}" 
              data-date="${isoDate}" 
              ${ativo ? `onclick="selecionarData('${isoDate}')"` : 'disabled'}>
        <div class="date-day">${diasSemana[diaSem]}</div>
        <div class="date-num">${d.getDate()}</div>
        <div class="date-month">${meses[d.getMonth()]}</div>
      </button>
    `;
  }).join('');

  // Auto-seleciona primeiro dia ativo
  const primeiroAtivo = dias.find(d => state.barber.work_schedule?.[String(d.getDay())]?.active);
  if (primeiroAtivo) {
    const iso = `${primeiroAtivo.getFullYear()}-${pad(primeiroAtivo.getMonth() + 1)}-${pad(primeiroAtivo.getDate())}`;
    selecionarData(iso);
  }
}

function selecionarData(isoDate) {
  state.dataSelecionada = isoDate;
  state.horarioSelecionado = null;

  document.querySelectorAll('.date-btn').forEach(el => {
    el.classList.toggle('selected', el.dataset.date === isoDate);
  });

  document.getElementById('step3').style.display = 'block';
  document.getElementById('step4').style.display = 'none';

  renderHorarios();

  setTimeout(() => {
    document.getElementById('step3').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

// ========== HORÁRIOS ==========
function renderHorarios() {
  const container = document.getElementById('horariosList');
  if (!container) return;

  const [y, m, d] = state.dataSelecionada.split('-').map(Number);
  const data = new Date(y, m - 1, d);
  const diaSem = data.getDay();
  const work = state.barber.work_schedule?.[String(diaSem)];

  if (!work || !work.active) {
    container.innerHTML = `<div class="horarios-empty">Barbeiro não atende neste dia.</div>`;
    return;
  }

  const [hIni, mIni] = work.start.split(':').map(Number);
  const [hFim, mFim] = work.end.split(':').map(Number);
  const duracao = state.servicoSelecionado.duracao_min || 30;

  const slots = [];
  let h = hIni, min = mIni;
  while (h < hFim || (h === hFim && min < mFim)) {
    slots.push({ h, min });
    min += SLOT_MIN;
    if (min >= 60) { min -= 60; h++; }
  }

  if (slots.length === 0) {
    container.innerHTML = `<div class="horarios-empty">Sem horários disponíveis neste dia.</div>`;
    return;
  }

  const agora = new Date();

  const slotsLivres = slots.map(slot => {
    const inicioSlot = new Date(y, m - 1, d, slot.h, slot.min, 0);
    const fimSlot = new Date(inicioSlot.getTime() + duracao * 60000);

    if (inicioSlot <= agora) {
      return { ...slot, disponivel: false };
    }

    const fimMinutosDia = hFim * 60 + mFim;
    const fimSlotMinutosDia = fimSlot.getHours() * 60 + fimSlot.getMinutes();
    if (fimSlotMinutosDia > fimMinutosDia && fimSlot.getDate() === inicioSlot.getDate()) {
      return { ...slot, disponivel: false };
    }

    const conflito = state.agendamentos.some(ag => {
      const agIni = new Date(ag.inicio);
      const agFim = new Date(ag.fim);
      return agIni < fimSlot && agFim > inicioSlot;
    });
    if (conflito) return { ...slot, disponivel: false };

    const bloqueado = state.blocks.some(b => {
      const bIni = new Date(b.inicio);
      const bFim = new Date(b.fim);
      return bIni < fimSlot && bFim > inicioSlot;
    });
    if (bloqueado) return { ...slot, disponivel: false };

    return { ...slot, disponivel: true };
  });

  const livres = slotsLivres.filter(s => s.disponivel);

  if (livres.length === 0) {
    container.innerHTML = `<div class="horarios-empty">Sem horários livres neste dia.<br>Tente outro dia.</div>`;
    return;
  }

  container.innerHTML = livres.map(s => `
    <button class="horario-btn" 
            data-time="${pad(s.h)}:${pad(s.min)}"
            onclick="selecionarHorario(${s.h}, ${s.min})">
      ${pad(s.h)}:${pad(s.min)}
    </button>
  `).join('');
}

function selecionarHorario(h, min) {
  state.horarioSelecionado = { h, min };

  document.querySelectorAll('.horario-btn').forEach(el => {
    el.classList.toggle('selected', el.dataset.time === `${pad(h)}:${pad(min)}`);
  });

  // Atualiza summary
  const dataObj = new Date(state.dataSelecionada + 'T00:00:00');
  const dataStr = dataObj.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  setSafe('sumServico', state.servicoSelecionado.nome);
  setSafe('sumData', dataStr);
  setSafe('sumHorario', `${pad(h)}:${pad(min)}`);
  setSafe('sumPreco', formatBRL(state.servicoSelecionado.preco));

  document.getElementById('step4').style.display = 'block';

  setTimeout(() => {
    document.getElementById('step4').scrollIntoView({ behavior: 'smooth', block: 'start' });
    const nameInput = document.querySelector('input[name="nome"]');
    if (nameInput) nameInput.focus();
  }, 100);
}

// ========== CONFIRMAR AGENDAMENTO ==========
async function confirmarAgendamento(e) {
  e.preventDefault();

  const form = e.target;
  const fd = new FormData(form);
  const nome = String(fd.get('nome') || '').trim();
  let telefone = String(fd.get('telefone') || '').replace(/\D/g, '');

  if (!nome || telefone.length < 10) {
    toast('Preencha nome e telefone corretamente', 'error');
    return;
  }

  if (!telefone.startsWith('55') && (telefone.length === 10 || telefone.length === 11)) {
    telefone = '55' + telefone;
  }

  const btn = document.getElementById('confirmBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Confirmando...';
  }

  const [y, m, d] = state.dataSelecionada.split('-').map(Number);
  const inicio = new Date(y, m - 1, d, state.horarioSelecionado.h, state.horarioSelecionado.min);
  const fim = new Date(inicio.getTime() + state.servicoSelecionado.duracao_min * 60000);

  try {
    const { data, error } = await sb.rpc('create_public_agendamento', {
      barber_slug: state.slug,
      p_servico_id: state.servicoSelecionado.id,
      cliente_phone: telefone,
      cliente_nome: nome,
      data_inicio: inicio.toISOString(),
      data_fim: fim.toISOString(),
      observacao: null
    });

    if (error) throw error;

    state.agendamentoConfirmado = {
      id: data,
      cliente_nome: nome,
      cliente_telefone: telefone,
      servico: state.servicoSelecionado,
      inicio,
      fim
    };

    showSuccess();
  } catch (err) {
    console.error(err);
    let msg = 'Erro ao criar agendamento';
    if (err.message?.includes('Horário já está ocupado')) {
      msg = 'Esse horário acabou de ser reservado por outra pessoa. Escolha outro.';
    } else if (err.message?.includes('Horário bloqueado')) {
      msg = 'O barbeiro bloqueou esse horário.';
    } else if (err.message) {
      msg = err.message;
    }
    toast(msg, 'error');

    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Confirmar agendamento';
    }

    await loadAgendamentos();
    renderHorarios();
  }
}

// Globals
window.selecionarServico = selecionarServico;
window.selecionarData = selecionarData;
window.selecionarHorario = selecionarHorario;
window.confirmarAgendamento = confirmarAgendamento;
