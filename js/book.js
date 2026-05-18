// ============================================
// CORTIFY - Página Pública de Agendamento (v2)
// Suporta MODO AUTÔNOMO + MODO BARBEARIA
// ============================================

const state = {
  slug: null,
  mode: null,          // 'AUTONOMO' | 'BARBERSHOP'
  barbershop: null,    // dados da barbearia (modo BARBERSHOP)
  profile: null,       // dados do profile (modo AUTONOMO)
  members: [],         // lista de barbeiros (modo BARBERSHOP)
  selectedMember: null, // barbeiro escolhido (modo BARBERSHOP)
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

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
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
    await loadPageInfo();
    showContent();
  } catch (err) {
    console.error(err);
    showInactive();
  }
})();

function showContent() {
  document.getElementById('loadingScreen').style.display = 'none';
  document.getElementById('contentScreen').style.display = 'block';
}

function showInactive() {
  document.getElementById('loadingScreen').style.display = 'none';
  document.getElementById('contentScreen').style.display = 'none';
  document.getElementById('successScreen').style.display = 'none';
  document.getElementById('inactiveScreen').style.display = 'block';
}

function showSuccess() {
  document.getElementById('contentScreen').style.display = 'none';
  document.getElementById('successScreen').style.display = 'block';

  const ag = state.agendamentoConfirmado;
  const dataStr = ag.inicio.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  const horaStr = ag.inicio.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  setSafe('confirmCliente', ag.cliente_nome);
  setSafe('confirmServico', ag.servico.nome);
  setSafe('confirmData', dataStr);
  setSafe('confirmHorario', horaStr);

  // Link WhatsApp pro barbeiro/barbearia
  const phone = (state.mode === 'BARBERSHOP'
    ? (state.selectedMember?.phone || state.barbershop?.whatsapp)
    : state.profile?.phone) || '';
  const phoneClean = phone.replace(/\D/g, '');
  const link = document.getElementById('whatsAppConfirm');
  if (phoneClean && link) {
    const nomeBarbeiro = state.mode === 'BARBERSHOP'
      ? state.selectedMember.display_name.split(' ')[0]
      : state.profile.name.split(' ')[0];
    const local = state.mode === 'BARBERSHOP' ? state.barbershop.name : nomeBarbeiro;
    const msg = `Olá ${nomeBarbeiro}! Acabei de agendar pelo link:\n\n📅 ${dataStr} às ${horaStr}\n✂️ ${ag.servico.nome}\n📍 ${local}\n\nMeu nome: ${ag.cliente_nome}`;
    link.href = `https://wa.me/${phoneClean}?text=${encodeURIComponent(msg)}`;
  } else if (link) {
    link.style.display = 'none';
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ========== CARREGA INFO DA PÁGINA ==========
async function loadPageInfo() {
  const { data, error } = await sb.rpc('get_public_page_info', { p_slug: state.slug });

  if (error || !data || !data.success) {
    throw new Error(data?.error || 'Página não encontrada');
  }

  state.mode = data.mode;

  if (state.mode === 'BARBERSHOP') {
    state.barbershop = data.barbershop;
    state.members = data.members || [];
    renderBarbershopHero();
    renderMemberSelection();
  } else {
    state.profile = data.profile;
    renderAutonomoHero();
    // No modo autônomo, carrega serviços direto
    await loadServicosForBarber(state.profile.id, state.profile.work_schedule);
  }

  document.title = state.mode === 'BARBERSHOP'
    ? `Agendar — ${state.barbershop.name}`
    : `Agendar com ${state.profile.name}`;
}

// ========== RENDER HERO ==========
function renderBarbershopHero() {
  const b = state.barbershop;
  setSafe('barberAvatar', getInitials(b.name));
  setSafe('barbershopName', '');
  setSafe('barberName', b.name);

  const bio = document.getElementById('barberBio');
  if (bio) {
    if (b.description) {
      bio.textContent = b.description;
      bio.style.display = 'block';
    } else {
      bio.style.display = 'none';
    }
  }
}

function renderAutonomoHero() {
  const p = state.profile;
  setSafe('barberAvatar', getInitials(p.name));
  setSafe('barberName', p.name);
  setSafe('barbershopName', p.barbershop_name || '');

  const bio = document.getElementById('barberBio');
  if (bio) {
    if (p.public_bio) {
      bio.textContent = p.public_bio;
      bio.style.display = 'block';
    } else {
      bio.style.display = 'none';
    }
  }
}

// ========== MODO BARBEARIA: ESCOLHA DO BARBEIRO ==========
function renderMemberSelection() {
  const container = document.getElementById('step1');
  if (!container) return;

  if (state.members.length === 0) {
    container.innerHTML = `
      <div class="step-h">
        <div class="step-num">1</div>
        <div class="step-title">Sem barbeiros</div>
      </div>
      <div class="horarios-empty">Essa barbearia ainda não tem barbeiros ativos.</div>
    `;
    return;
  }

  // Se só tem 1 barbeiro, escolhe automático e mostra os serviços
  if (state.members.length === 1) {
    selecionarBarbeiro(state.members[0].user_id, true);
    return;
  }

  container.innerHTML = `
    <div class="step-h">
      <div class="step-num">1</div>
      <div class="step-title">Com qual barbeiro?</div>
    </div>
    <div class="members-grid">
      ${state.members.map(m => `
        <button class="member-card" data-id="${m.user_id}" onclick="selecionarBarbeiro('${m.user_id}')">
          ${m.photo_url
            ? `<img src="${escapeHtml(m.photo_url)}" alt="" class="member-photo">`
            : `<div class="member-avatar">${getInitials(m.display_name)}</div>`
          }
          <div class="member-info">
            <div class="member-name">${escapeHtml(m.display_name)}</div>
            ${m.bio ? `<div class="member-bio">${escapeHtml(m.bio)}</div>` : ''}
          </div>
        </button>
      `).join('')}
    </div>
  `;
}

window.selecionarBarbeiro = async function selecionarBarbeiro(userId, isAutoSelect = false) {
  const member = state.members.find(m => m.user_id === userId);
  if (!member) return;

  state.selectedMember = member;
  state.servicoSelecionado = null;
  state.dataSelecionada = null;
  state.horarioSelecionado = null;

  // Highlight visual
  document.querySelectorAll('.member-card').forEach(el => {
    el.classList.toggle('selected', el.dataset.id === userId);
  });

  // Carrega work_schedule do barbeiro (vamos pegar via RPC)
  // Por enquanto, usa o da barbearia ou um default
  await loadServicosForBarber(userId, state.barbershop?.work_schedule || {});

  // Mostra os steps seguintes
  document.getElementById('step2-services').style.display = 'block';

  if (!isAutoSelect) {
    setTimeout(() => {
      document.getElementById('step2-services').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }
};

// ========== CARREGA SERVIÇOS + DISPONIBILIDADE ==========
async function loadServicosForBarber(userId, fallbackWorkSchedule) {
  const [servicosRes, availRes] = await Promise.all([
    sb.rpc('get_public_barber_services', { p_user_id: userId }),
    sb.rpc('get_public_barber_availability', { p_user_id: userId, p_days_ahead: DIAS_FUTURO })
  ]);

  if (servicosRes.error) {
    console.error(servicosRes.error);
    return;
  }

  state.servicos = (servicosRes.data || []).map(s => ({
    id: s.service_id,
    nome: s.nome,
    preco: Number(s.preco),
    duracao_min: s.duracao_min,
  }));

  const avail = availRes.data || { agendamentos: [], blocks: [] };
  state.agendamentos = avail.agendamentos || [];
  state.blocks = avail.blocks || [];

  // Pega work_schedule do barbeiro - precisa ser do profile dele
  // Como ainda não temos diretamente, vamos buscar
  if (!state.selectedMemberWorkSchedule) {
    const { data: profile } = await sb
      .from('profiles')
      .select('work_schedule')
      .eq('id', userId)
      .maybeSingle();
    state.selectedMemberWorkSchedule = profile?.work_schedule || fallbackWorkSchedule || {};
  }

  renderServicos();
}

function renderServicos() {
  const container = document.getElementById('servicosList');
  if (!container) return;

  if (state.servicos.length === 0) {
    container.innerHTML = `<div class="horarios-empty">Ainda não há serviços cadastrados.</div>`;
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

window.selecionarServico = function selecionarServico(id) {
  state.servicoSelecionado = state.servicos.find(s => s.id === id);
  state.dataSelecionada = null;
  state.horarioSelecionado = null;

  document.querySelectorAll('.servico-row').forEach(el => {
    el.classList.toggle('selected', el.dataset.id === id);
  });

  document.getElementById('step3-date').style.display = 'block';
  document.getElementById('step4-time').style.display = 'none';
  document.getElementById('step5-form').style.display = 'none';

  renderDates();

  setTimeout(() => {
    document.getElementById('step3-date').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
};

// ========== DATAS ==========
function renderDates() {
  const container = document.getElementById('datesList');
  if (!container) return;

  // Usa work_schedule do barbeiro/profile selecionado
  const workSchedule = state.mode === 'BARBERSHOP'
    ? (state.selectedMemberWorkSchedule || {})
    : (state.profile.work_schedule || {});

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
    const work = workSchedule[String(diaSem)];
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
  const primeiroAtivo = dias.find(d => workSchedule[String(d.getDay())]?.active);
  if (primeiroAtivo) {
    const iso = `${primeiroAtivo.getFullYear()}-${pad(primeiroAtivo.getMonth() + 1)}-${pad(primeiroAtivo.getDate())}`;
    selecionarData(iso);
  }
}

window.selecionarData = function selecionarData(isoDate) {
  state.dataSelecionada = isoDate;
  state.horarioSelecionado = null;

  document.querySelectorAll('.date-btn').forEach(el => {
    el.classList.toggle('selected', el.dataset.date === isoDate);
  });

  document.getElementById('step4-time').style.display = 'block';
  document.getElementById('step5-form').style.display = 'none';

  renderHorarios();

  setTimeout(() => {
    document.getElementById('step4-time').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
};

// ========== HORÁRIOS ==========
function renderHorarios() {
  const container = document.getElementById('horariosList');
  if (!container) return;

  const workSchedule = state.mode === 'BARBERSHOP'
    ? (state.selectedMemberWorkSchedule || {})
    : (state.profile.work_schedule || {});

  const [y, m, d] = state.dataSelecionada.split('-').map(Number);
  const data = new Date(y, m - 1, d);
  const diaSem = data.getDay();
  const work = workSchedule[String(diaSem)];

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

  const agora = new Date();

  const slotsLivres = slots.map(slot => {
    const inicioSlot = new Date(y, m - 1, d, slot.h, slot.min, 0);
    const fimSlot = new Date(inicioSlot.getTime() + duracao * 60000);

    if (inicioSlot <= agora) return { ...slot, disponivel: false };

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
    <button class="horario-btn" data-time="${pad(s.h)}:${pad(s.min)}" onclick="selecionarHorario(${s.h}, ${s.min})">
      ${pad(s.h)}:${pad(s.min)}
    </button>
  `).join('');
}

window.selecionarHorario = function selecionarHorario(h, min) {
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

  // Mostra barbeiro escolhido no resumo (só modo barbearia)
  const sumBarbeiroRow = document.getElementById('sumBarbeiroRow');
  if (sumBarbeiroRow) {
    if (state.mode === 'BARBERSHOP' && state.selectedMember) {
      sumBarbeiroRow.style.display = 'flex';
      setSafe('sumBarbeiro', state.selectedMember.display_name);
    } else {
      sumBarbeiroRow.style.display = 'none';
    }
  }

  document.getElementById('step5-form').style.display = 'block';

  setTimeout(() => {
    document.getElementById('step5-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
    const nameInput = document.querySelector('input[name="nome"]');
    if (nameInput) nameInput.focus();
  }, 100);
};

// ========== CONFIRMAR AGENDAMENTO ==========
window.confirmarAgendamento = async function confirmarAgendamento(e) {
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

  // Chama a função v2 que suporta barbearia + autônomo
  const payload = {
    p_slug: state.slug,
    p_servico_id: state.servicoSelecionado.id,
    p_cliente_phone: telefone,
    p_cliente_nome: nome,
    p_data_inicio: inicio.toISOString(),
    p_data_fim: fim.toISOString(),
    p_observacao: null,
  };

  if (state.mode === 'BARBERSHOP' && state.selectedMember) {
    payload.p_barber_user_id = state.selectedMember.user_id;
  }

  try {
    const { data, error } = await sb.rpc('create_public_agendamento_v2', payload);

    if (error) throw error;
    if (data && !data.success) throw new Error(data.error);

    state.agendamentoConfirmado = {
      id: data.agendamento_id,
      cliente_nome: nome,
      cliente_telefone: telefone,
      servico: state.servicoSelecionado,
      inicio,
      fim,
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

    // Recarrega disponibilidade
    const userId = state.mode === 'BARBERSHOP' ? state.selectedMember.user_id : state.profile.id;
    const { data: avail } = await sb.rpc('get_public_barber_availability', { p_user_id: userId, p_days_ahead: DIAS_FUTURO });
    if (avail) {
      state.agendamentos = avail.agendamentos || [];
      state.blocks = avail.blocks || [];
      renderHorarios();
    }
  }
};
