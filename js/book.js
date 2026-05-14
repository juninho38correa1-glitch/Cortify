// ============================================
// CORTIFY - Página Pública de Agendamento
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
  el.style.cssText = `background:${type === 'error' ? '#3a1a1a' : type === 'success' ? '#1a3a25' : '#1a1a1a'};color:#fff;padding:12px 18px;border-radius:10px;margin-top:8px;border:1px solid ${type === 'error' ? '#e07474' : type === 'success' ? '#6fcf97' : '#333'};font-size:13px;box-shadow:0 4px 12px rgba(0,0,0,0.3)`;
  el.textContent = msg;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ========== INICIALIZAÇÃO ==========
(async function init() {
  // Pega slug da URL: ?b=marcos
  const params = new URLSearchParams(window.location.search);
  state.slug = params.get('b');

  if (!state.slug) {
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('errorState').style.display = 'block';
    return;
  }

  // Inicializa Supabase
  const sb = window.supabase.createClient(
    window.SUPABASE_CONFIG.url,
    window.SUPABASE_CONFIG.anonKey
  );
  window.sb = sb;

  try {
    await loadBarber();
    await loadServicos();
    await loadAgendamentos();
    showBookingFlow();
  } catch (err) {
    console.error(err);
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('errorState').style.display = 'block';
  }
})();

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

  // Renderiza header
  const initials = (data.name || '?').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
  document.getElementById('barberAvatar').textContent = initials;
  document.getElementById('barberName').textContent = data.name || '';
  document.getElementById('barberShop').textContent = data.barbershop_name || '';
  document.getElementById('barberBio').textContent = data.public_bio || '';

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

  if (state.servicos.length === 0) {
    container.innerHTML = `<div class="empty-msg">Esse barbeiro ainda não cadastrou serviços.</div>`;
    return;
  }

  container.innerHTML = state.servicos.map(s => `
    <div class="servico-item" data-id="${s.id}" onclick="selecionarServico('${s.id}')">
      <div class="servico-item-info">
        <div class="servico-item-name">${escapeHtml(s.nome)}</div>
        <div class="servico-item-meta">${s.duracao_min} min</div>
      </div>
      <div class="servico-item-price">${formatBRL(s.preco)}</div>
    </div>
  `).join('');
}

function selecionarServico(id) {
  state.servicoSelecionado = state.servicos.find(s => s.id === id);
  state.dataSelecionada = null;
  state.horarioSelecionado = null;

  document.querySelectorAll('.servico-item').forEach(el => {
    el.classList.toggle('selected', el.dataset.id === id);
  });

  document.getElementById('stepDateTime').style.display = 'block';
  document.getElementById('stepDados').style.display = 'none';
  renderDateScroll();

  setTimeout(() => {
    document.getElementById('stepDateTime').scrollIntoView({ behavior: 'smooth', block: 'start' });
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

// ========== DATE SCROLL ==========
function renderDateScroll() {
  const container = document.getElementById('dateScroll');
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
      <div class="date-pill ${!ativo ? 'disabled' : ''}" 
           data-date="${isoDate}" 
           ${ativo ? `onclick="selecionarData('${isoDate}')"` : ''}>
        <div class="date-pill-day">${diasSemana[diaSem]}</div>
        <div class="date-pill-num">${d.getDate()}</div>
        <div class="date-pill-month">${meses[d.getMonth()]}</div>
      </div>
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

  document.querySelectorAll('.date-pill').forEach(el => {
    el.classList.toggle('selected', el.dataset.date === isoDate);
  });

  renderTimeSlots();
}

// ========== TIME SLOTS ==========
function renderTimeSlots() {
  const container = document.getElementById('timeSlots');
  const [y, m, d] = state.dataSelecionada.split('-').map(Number);
  const data = new Date(y, m - 1, d);
  const diaSem = data.getDay();
  const work = state.barber.work_schedule?.[String(diaSem)];

  if (!work || !work.active) {
    container.innerHTML = `<div class="empty-msg">Barbeiro não atende neste dia.</div>`;
    return;
  }

  const [hIni, mIni] = work.start.split(':').map(Number);
  const [hFim, mFim] = work.end.split(':').map(Number);
  const duracao = state.servicoSelecionado.duracao_min || 30;

  // Gera todos os slots
  const slots = [];
  let h = hIni, min = mIni;
  while (h < hFim || (h === hFim && min < mFim)) {
    slots.push({ h, min });
    min += SLOT_MIN;
    if (min >= 60) { min -= 60; h++; }
  }

  if (slots.length === 0) {
    container.innerHTML = `<div class="empty-msg">Sem horários disponíveis neste dia.</div>`;
    return;
  }

  const agora = new Date();

  const slotsLivres = slots.map(slot => {
    const inicioSlot = new Date(y, m - 1, d, slot.h, slot.min, 0);
    const fimSlot = new Date(inicioSlot.getTime() + duracao * 60000);

    // Passado
    if (inicioSlot <= agora) {
      return { ...slot, disponivel: false, motivo: 'passado' };
    }

    // Passa do horário fim
    const fimMinutosDia = hFim * 60 + mFim;
    const fimSlotMinutosDia = fimSlot.getHours() * 60 + fimSlot.getMinutes();
    if (fimSlotMinutosDia > fimMinutosDia && fimSlot.getDate() === inicioSlot.getDate()) {
      return { ...slot, disponivel: false, motivo: 'fim_dia' };
    }

    // Conflito com agendamento
    const conflito = state.agendamentos.some(ag => {
      const agIni = new Date(ag.inicio);
      const agFim = new Date(ag.fim);
      return agIni < fimSlot && agFim > inicioSlot;
    });
    if (conflito) {
      return { ...slot, disponivel: false, motivo: 'ocupado' };
    }

    // Bloqueio
    const bloqueado = state.blocks.some(b => {
      const bIni = new Date(b.inicio);
      const bFim = new Date(b.fim);
      return bIni < fimSlot && bFim > inicioSlot;
    });
    if (bloqueado) {
      return { ...slot, disponivel: false, motivo: 'bloqueado' };
    }

    return { ...slot, disponivel: true };
  });

  const algumLivre = slotsLivres.some(s => s.disponivel);

  if (!algumLivre) {
    container.innerHTML = `<div class="empty-msg">Sem horários livres neste dia.<br>Tente outro dia.</div>`;
    return;
  }

  container.innerHTML = `
    <div class="time-grid">
      ${slotsLivres.map(s => `
        <div class="time-slot ${s.disponivel ? '' : 'disabled'}" 
             ${s.disponivel ? `onclick="selecionarHorario(${s.h}, ${s.min})"` : ''}
             data-time="${pad(s.h)}:${pad(s.min)}">
          ${pad(s.h)}:${pad(s.min)}
        </div>
      `).join('')}
    </div>
  `;
}

function selecionarHorario(h, min) {
  state.horarioSelecionado = { h, min };

  document.querySelectorAll('.time-slot').forEach(el => {
    el.classList.toggle('selected', el.dataset.time === `${pad(h)}:${pad(min)}`);
  });

  document.getElementById('stepDados').style.display = 'block';
  setTimeout(() => {
    document.getElementById('stepDados').scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.querySelector('input[name="nome"]').focus();
  }, 100);
}

// ========== CONFIRMAR AGENDAMENTO ==========
async function confirmarAgendamento(e) {
  e.preventDefault();

  const form = e.target;
  const fd = new FormData(form);
  const nome = String(fd.get('nome') || '').trim();
  let telefone = String(fd.get('telefone') || '').replace(/\D/g, '');
  const observacao = String(fd.get('observacao') || '').trim();

  if (!nome || telefone.length < 10) {
    toast('Preencha nome e telefone corretamente', 'error');
    return;
  }

  // Normaliza telefone (adiciona 55 se não tiver)
  if (!telefone.startsWith('55') && (telefone.length === 10 || telefone.length === 11)) {
    telefone = '55' + telefone;
  }

  const btn = document.getElementById('confirmBtn');
  btn.disabled = true;
  btn.innerHTML = 'Confirmando...';

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
      observacao: observacao || null
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
    btn.disabled = false;
    btn.innerHTML = 'Confirmar agendamento';

    await loadAgendamentos();
    renderTimeSlots();
  }
}

// ========== TELA DE SUCESSO ==========
function showSuccess() {
  document.getElementById('stepServico').style.display = 'none';
  document.getElementById('stepDateTime').style.display = 'none';
  document.getElementById('stepDados').style.display = 'none';

  const screen = document.getElementById('successScreen');
  screen.style.display = 'block';

  const ag = state.agendamentoConfirmado;
  const dataStr = ag.inicio.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  const horaStr = ag.inicio.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const horaFimStr = ag.fim.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  document.getElementById('bookingSummary').innerHTML = `
    <div class="booking-summary-row">
      <span class="booking-summary-label">Serviço</span>
      <span class="booking-summary-value">${escapeHtml(ag.servico.nome)}</span>
    </div>
    <div class="booking-summary-row">
      <span class="booking-summary-label">Data</span>
      <span class="booking-summary-value">${dataStr}</span>
    </div>
    <div class="booking-summary-row">
      <span class="booking-summary-label">Horário</span>
      <span class="booking-summary-value">${horaStr} — ${horaFimStr}</span>
    </div>
    <div class="booking-summary-row">
      <span class="booking-summary-label">Valor</span>
      <span class="booking-summary-value" style="color:var(--gold)">${formatBRL(ag.servico.preco)}</span>
    </div>
    <div class="booking-summary-row">
      <span class="booking-summary-label">Barbeiro</span>
      <span class="booking-summary-value">${escapeHtml(state.barber.name)}</span>
    </div>
  `;

  // Link WhatsApp pro cliente confirmar com o barbeiro
  const phone = (state.barber.phone || '').replace(/\D/g, '');
  if (phone) {
    const msg = `Olá ${state.barber.name.split(' ')[0]}! Acabei de agendar pelo seu link:\n\n📅 ${dataStr} às ${horaStr}\n✂️ ${ag.servico.nome}\n\nMeu nome: ${ag.cliente_nome}`;
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
    document.getElementById('whatsappConfirmLink').href = url;
  } else {
    document.getElementById('whatsappConfirmLink').style.display = 'none';
  }

  screen.scrollIntoView({ behavior: 'smooth' });
}

function showBookingFlow() {
  document.getElementById('loadingState').style.display = 'none';
  document.getElementById('bookingFlow').style.display = 'block';
}

// Globals
window.selecionarServico = selecionarServico;
window.selecionarData = selecionarData;
window.selecionarHorario = selecionarHorario;
window.confirmarAgendamento = confirmarAgendamento;
